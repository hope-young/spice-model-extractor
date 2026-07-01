"""driveby.py — run a full SPICE model extraction pipeline headless.

Drives SpiceBuilder's FastAPI backend on http://127.0.0.1:8000 directly —
no GUI, no Tauri, no MCP needed.  Designed for agent-driven workflow
(AI calling AI).

Workflow:
  1. POST /api/projects/load          (validate .xlsx, build initial model)
  2. POST /api/projects/{id}/fit      (kick off async 6-stage fit)
  3. GET  /api/tasks/{task_id}        (poll until completed/failed)
  4. POST /api/projects/{id}/export   (write .lib to disk)

Usage:
    python scripts/driveby.py --excel PATH --out PATH

Exit codes:
    0   fit completed and .lib written
    1   fit failed (see error message)
    2   connection / input error
"""

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List

# Ensure the repo root is on sys.path so `import spicebuilder` works
# even when this script is invoked as `python scripts/driveby.py` from
# outside a `pip install -e .` venv.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

DEFAULT_BASE = "http://127.0.0.1:8000"
DEFAULT_STAGES = ["S1", "S2", "S3", "S4", "S5", "S6"]


def http_request(method: str, url: str, payload: Dict[str, Any] | None = None,
                 timeout: float = 30.0) -> Dict[str, Any]:
    """Issue an HTTP request and parse JSON. Raises on non-2xx."""
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(
        url, data=body, method=method,
        headers={"Content-Type": "application/json"} if body else {},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
            return json.loads(data) if data else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace") if e.fp else str(e)
        print(f"HTTP {e.code} {method} {url}\n  payload: {payload}\n  detail: {detail}",
              file=sys.stderr)
        raise


def wait_task(base: str, task_id: str, interval: float, timeout: float) -> Dict[str, Any]:
    """Poll task status until completed or failed. Returns final TaskInfo."""
    deadline = time.time() + timeout
    print(f"\n[fit] task {task_id} started; polling every {interval}s, timeout {timeout}s")
    while True:
        info = http_request("GET", f"{base}/api/tasks/{task_id}")
        ts = time.strftime("%H:%M:%S")
        print(f"  [{ts}] {info['status']:10s} progress={info['progress']:.2f}", flush=True)
        if info["status"] in ("completed", "failed"):
            return info
        if time.time() > deadline:
            print(f"  TIMEOUT after {timeout}s", file=sys.stderr)
            sys.exit(1)
        time.sleep(interval)


def main() -> int:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--excel", required=True, help="Path to SDH-format .xlsx")
    p.add_argument("--out", required=True, help="Path to .lib output")
    p.add_argument("--base", default=DEFAULT_BASE,
                   help=f"Backend base URL (default: {DEFAULT_BASE})")
    p.add_argument("--name", default=None,
                   help="Project display name (defaults to device part number)")
    p.add_argument("--max-loops", type=int, default=3)
    p.add_argument("--error-threshold", type=float, default=1.0)
    p.add_argument("--stages", default=",".join(DEFAULT_STAGES),
                   help="Comma-separated stage list (default: S1..S6)")
    p.add_argument("--format", choices=("A", "B"), default="B",
                   help="A: pure BSIM3 .model, B: .subckt wrapper")
    p.add_argument("--rg", type=float, default=1.6, help="Gate resistance in Ohms")
    p.add_argument("--use-ltspice", dest="use_ltspice",
                   action=argparse.BooleanOptionalAction, default=True,
                   help="Use real LTspice simulator as objective (default: enabled, fall back to formula if not installed)")
    p.add_argument("--poll-interval", type=float, default=1.0,
                   help="Seconds between status polls")
    p.add_argument("--timeout", type=float, default=600.0,
                   help="Max wait for fit completion (seconds)")
    p.add_argument("--report-xlsx", default=None,
                   help="If set, write a multi-sheet Excel fit report to this path (after .lib export).")
    args = p.parse_args()

    base = args.base.rstrip("/")
    stages: List[str] = [s.strip() for s in args.stages.split(",") if s.strip()]

    # 1) load
    try:
        print(f"\n[load] {args.excel}", flush=True)
        resp = http_request("POST", f"{base}/api/projects/load",
                            payload={"excel_path": args.excel, "name": args.name})
    except urllib.error.URLError as e:
        print(f"Cannot reach backend at {base}: {e}", file=sys.stderr)
        return 2
    print(f"  project_id: {resp['project_id']}")
    print(f"  device_info:")
    for k, v in resp["device_info"].items():
        print(f"    {k}: {v}")
    print(f"  key_params:")
    for k, v in resp["key_params"].items():
        print(f"    {k}: {v}")
    print(f"  curve_counts: {resp['curve_counts']}")
    project_id = resp["project_id"]

    # 2) fit (kicks off async task)
    print(f"\n[fit] starting 6-stage fit (max_loops={args.max_loops}, "
          f"threshold={args.error_threshold}, stages={stages})")
    fit_resp = http_request("POST", f"{base}/api/projects/{project_id}/fit",
                            payload={
                                "stages": stages,
                                "max_loops": args.max_loops,
                                "error_threshold": args.error_threshold,
                                "use_ltspice": args.use_ltspice,
                                "optimizer": {
                                    "method": "trf", "eps1": 1e-3,
                                    "eps2": 1e-3, "eps3": 1e-3,
                                    "max_iter": 30, "parallel_jobs": 1,
                                },
                            })
    task_id = fit_resp["task_id"]

    # 3) poll
    final = wait_task(base, task_id, args.poll_interval, args.timeout)
    if final["status"] != "completed":
        print(f"\nfit FAILED: {final['error']}", file=sys.stderr)
        return 1
    fit = final["result"]
    rms = fit["total_rms"]
    r2 = fit["r_squared"]
    # log-domain NRMSE, lower is better; R² is in [0, 1], 1 is perfect.
    print(f"\n[fit] Total RMS  : {rms:.4f}    (log-NRMSE; lower is better)")
    print(f"      Total R²   : {r2:.4f}    (goodness of fit; 1 is perfect)")
    print(f"      iterations : {fit['iterations']}")
    for s in fit["stages"]:
        status = "OK" if s["success"] else "FAIL"
        sr2 = s.get("r_squared")
        sr2_str = f"{sr2:.4f}" if isinstance(sr2, (int, float)) else "n/a"
        print(f"  {s['name']}: rms={s['rms']:.4f}  R²={sr2_str}  [{status}]")

    # 4) export
    print(f"\n[export] {args.out}")
    exp_resp = http_request("POST", f"{base}/api/projects/{project_id}/export",
                            payload={
                                "format": args.format,
                                "output_path": args.out,
                                "rg_ohm": args.rg,
                                "include_diode": True,
                            })
    print(f"  written: {exp_resp['file_path']}  ({exp_resp['n_bytes']} bytes)")

    # 5) Optional Excel report
    if args.report_xlsx:
        _write_excel_report(
            base=base, project_id=project_id,
            device_info=resp["device_info"], key_params=resp["key_params"],
            curve_counts=resp["curve_counts"], fit_result=fit,
            out_xlsx=Path(args.report_xlsx),
            lib_path=Path(args.out),
        )
    return 0


def _write_excel_report(
    *, base: str, project_id: str,
    device_info: dict, key_params: dict, curve_counts: dict,
    fit_result: dict, out_xlsx: Path,
    lib_path: Path = None,
) -> None:
    """Pull curve data from the backend and write a multi-sheet Excel report."""
    try:
        from spicebuilder.report import build_report
    except ImportError as e:
        print(f"[report] cannot import spicebuilder.report: {e}", file=sys.stderr)
        print("[report] Either `pip install -e .` in the SpiceBuilder repo, or run",
              file=sys.stderr)
        print("[report] driveby.py from a shell where the repo root is on PYTHONPATH.",
              file=sys.stderr)
        return

    print(f"\n[report] fetching curves → {out_xlsx}")
    curve_specs = [
        ("idvg_5v",     "idvg_5v"),
        ("idvg_05v",    "idvg_05v"),
        ("idvd",        "idvd"),
        ("cv_ciss",     "cv_vds_ciss"),
        ("cv_coss",     "cv_vds_coss"),
        ("cv_crss",     "cv_vds_crss"),
        ("body_diode",  "body_diode"),
    ]
    curves: dict = {}
    for local_key, route_key in curve_specs:
        try:
            # IdVd curves have multiple Vgs levels; pin to Vgs=10V for
            # the report so the cached fit matches the sim.iv that
            # the route returns.
            extra_qs = "?vgs_v=10" if route_key == "idvd" else ""
            r = http_request("GET", f"{base}/api/projects/{project_id}/curves/{route_key}{extra_qs}")
            curves[local_key] = {
                "ivar": r["data"].get("ivar", []) or [],
                "dvar": r["data"].get("dvar", []) or [],
                "fit":  r["data"].get("fit"),
            }
            n = len(curves[local_key]["ivar"])
            n_fit = sum(1 for v in curves[local_key]["fit"] if v is not None) \
                    if curves[local_key]["fit"] is not None else 0
            msg = f" {n} points"
            if curves[local_key]["fit"] is None:
                msg += " (no fit — run fit first)"
            elif n_fit < n:
                msg += f" (fit covers {n_fit}/{n} points)"
            else:
                msg += " (fit present)"
            print(f"  {local_key}: {msg}")
        except urllib.error.HTTPError as e:
            print(f"  {local_key}: HTTP {e.code} (skipping)", file=sys.stderr)

    build_report(
        out_path=out_xlsx,
        device_info=device_info,
        key_params=key_params,
        fit_result=fit_result,
        curve_counts=curve_counts,
        curves=curves,
        lib_path=lib_path,
    )
    print(f"  Excel written: {out_xlsx}")


if __name__ == "__main__":
    sys.exit(main())
