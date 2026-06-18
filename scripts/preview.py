"""
preview.py
==========
实时预览 helper — 跑完任何生成 PNG/.lib 的脚本后自动打开。

用法：
  python scripts/preview.py              # 跑 demo + plot，自动打开所有产物
  python scripts/preview.py --no-open    # 只跑不打开
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
import os
import platform
import subprocess
import argparse
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
IS_WINDOWS = platform.system() == "Windows"


def open_file(path: Path):
    """用系统默认程序打开文件"""
    if not path.exists():
        print(f"  [skip] {path} (not found)")
        return
    try:
        if IS_WINDOWS:
            os.startfile(str(path))
        elif platform.system() == "Darwin":
            subprocess.run(["open", str(path)], check=False)
        else:
            subprocess.run(["xdg-open", str(path)], check=False)
        print(f"  [open] {path.name}")
    except Exception as e:
        print(f"  [fail] {path.name}: {e}")


def run_script(cmd: list, name: str) -> bool:
    """跑子脚本"""
    print(f"\n=== Running {name} ===")
    try:
        r = subprocess.run(cmd, cwd=str(REPO), check=False)
        return r.returncode == 0
    except Exception as e:
        print(f"  [error] {e}")
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-open", action="store_true", help="don't auto-open files")
    parser.add_argument("--demo-only", action="store_true", help="only run demo")
    parser.add_argument("--plot-only", action="store_true", help="only run plot")
    args = parser.parse_args()

    # 1. Run demo (load + fit + export .lib)
    if not args.plot_only:
        env = os.environ.copy()
        env["PYTHONPATH"] = str(REPO)
        run_script(
            ["python", "scripts/run_demo.py"],
            "run_demo.py (load → 6-stage fit → export .lib → LTspice verify)"
        )

    # 2. Run plot (4 plots + 1 placeholder + info card)
    if not args.demo_only:
        env = os.environ.copy()
        env["PYTHONPATH"] = str(REPO)
        run_script(
            ["python", "scripts/plot_fit_results.py"],
            "plot_fit_results.py (5 subplots → 3 output files)"
        )

    # 3. Auto-open all generated files
    if not args.no_open:
        print("\n=== Auto-opening files in default viewer ===")
        candidates = [
            REPO / "datademo" / "fit_comparison.png",
            REPO / "datademo" / "fit_comparison_all_log.png",
            REPO / "datademo" / "fit_comparison.html",
            REPO / "datademo" / "SDH10N2P1WC-AA.lib",
        ]
        for c in candidates:
            open_file(c)

    print("\n=== Done ===")


if __name__ == "__main__":
    main()
