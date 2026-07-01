"""
ltspice.py
==========
LTspice XVII backend - subprocess 封装。

关键：
- 使用 -b 模式（batch, 无 GUI，绝对不能让用户看到 LTspice 窗口）
- 临时目录隔离（不污染用户工作区）
- stdout/stderr 重定向
- 失败清晰报错
- 支持 .log 和 .raw 解析
"""
from __future__ import annotations
import atexit
import os
import re
import shutil
import subprocess
import tempfile

import numpy as np
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class SimulationResult:
    """单次 LTspice 仿真结果"""
    success: bool = False
    log_text: str = ""
    error_text: str = ""
    raw_path: Optional[Path] = None
    log_path: Optional[Path] = None
    elapsed_s: float = 0.0
    measurements: dict = field(default_factory=dict)
    error: str = ""


def find_ltspice() -> Optional[str]:
    """查找 LTspice 可执行文件

    优先级：
    1. PATH 中的 'ltspice' 命令
    2. 标准安装位置
    """
    # 1. PATH
    exe = shutil.which("ltspice")
    if exe:
        return exe
    exe = shutil.which("LTspice")
    if exe:
        return exe
    exe = shutil.which("LTspice.exe")
    if exe:
        return exe
    # 2. 常见安装位置
    candidates = [
        Path.home() / "AppData/Local/Programs/ADI/LTspice/LTspice.exe",
        Path("C:/Program Files/LTspiceXVII/XVIIx64.exe"),
        Path("C:/Program Files (x86)/LTspiceIV/switch.exe"),
    ]
    for c in candidates:
        if c.exists():
            return str(c)
    return None


class LTspiceBackend:
    """LTspice 后端 - subprocess 封装

    用法：
        backend = LTspiceBackend()
        netlist = "..."  # SPICE netlist 文本
        result = backend.run_netlist_text(netlist, timeout_s=60)
    """

    def __init__(self,
                 ltspice_path: Optional[str] = None,
                 cleanup: bool = True):
        self.ltspice_path = ltspice_path or find_ltspice()
        if not self.ltspice_path:
            raise RuntimeError(
                "LTspice 未找到。请安装 LTspice 或设置 PATH 环境变量。\n"
                "下载地址: https://www.analog.com/en/design-center/design-tools-and-calculators/ltspice-simulator.html"
            )
        self.cleanup = cleanup
        # Tracks tmpdirs explicitly retained by the caller (cleanup=False).
        # These are still wiped on interpreter shutdown so the process never
        # exits with leaked temp directories.
        self._kept_tmpdirs: list[str] = []
        try:
            atexit.register(self._cleanup_kept_tmpdirs)
        except Exception:
            # atexit must succeed in normal CPython; defensive.
            pass

    def run_netlist_text(self,
                         netlist: str,
                         timeout_s: int = 60,
                         output_dir: Optional[Path] = None,
                         cleanup: Optional[bool] = None) -> SimulationResult:
        """运行一段 SPICE netlist 文本

        Args:
            netlist: 完整 SPICE netlist 文本
            timeout_s: 超时秒数
            output_dir: 输出目录（None = 临时目录）
            cleanup: 是否清理临时目录 (None = 用 self.cleanup, 通常 True)
                   设 False 以保留 .raw 文件供后续 parse_raw 使用

        Returns:
            SimulationResult (含 raw_path 指向 .raw 文件)
        """
        if output_dir is None:
            tmpdir = Path(tempfile.mkdtemp(prefix="spicebuilder_"))
        else:
            tmpdir = Path(output_dir)
            tmpdir.mkdir(parents=True, exist_ok=True)

        netlist_path = tmpdir / "sim.cir"
        netlist_path.write_text(netlist, encoding="utf-8")

        result = self.run(netlist_path, timeout_s=timeout_s)

        # Decide whether to clean up.  When caller asks to keep the tmpdir
        # (e.g. to retain .raw for later parsing) we still register it for
        # atexit cleanup so it does not leak across the process lifetime.
        should_cleanup = cleanup if cleanup is not None else self.cleanup
        if should_cleanup and output_dir is None:
            try:
                shutil.rmtree(tmpdir)
            except OSError:
                pass
        else:
            self._kept_tmpdirs.append(str(tmpdir))
        return result

    def _cleanup_kept_tmpdirs(self) -> None:
        """Wipe every tmpdir the caller asked to keep.

        Registered with atexit in __init__ so the process never exits with
        leftover /tmp/spicebuilder_* directories.
        """
        for d in self._kept_tmpdirs:
            try:
                shutil.rmtree(d, ignore_errors=True)
            except Exception:
                pass
        self._kept_tmpdirs.clear()

    def run(self,
            netlist_path: Path,
            timeout_s: int = 60) -> SimulationResult:
        """运行一个 netlist 文件

        Args:
            netlist_path: .cir/.net 文件路径
            timeout_s: 超时秒数

        Returns:
            SimulationResult
        """
        netlist_path = Path(netlist_path)
        if not netlist_path.exists():
            return SimulationResult(success=False, error=f"Netlist not found: {netlist_path}")

        # 关键：使用 -b 模式（batch, 无 GUI）
        cmd = [self.ltspice_path, "-b", "-ascii", str(netlist_path)]
        # -b: batch mode (no GUI)
        # -ascii: 输出 ASCII .raw 格式（而非二进制），便于解析

        start = time.time()
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout_s,
                cwd=str(netlist_path.parent),
                # 隐藏窗口
                creationflags=0x08000000 if os.name == 'nt' else 0,  # CREATE_NO_WINDOW
            )
            elapsed = time.time() - start
            stdout = proc.stdout or ""
            stderr = proc.stderr or ""
        except subprocess.TimeoutExpired:
            return SimulationResult(
                success=False,
                error=f"Timeout after {timeout_s}s",
                elapsed_s=time.time() - start,
            )
        except (OSError, subprocess.SubprocessError) as e:
            # Subprocess / OS-level failure only.  Let other exceptions
            # (TypeError, ValueError, KeyboardInterrupt, ...) propagate so
            # code-level bugs are not masked as simulation errors.
            return SimulationResult(
                success=False,
                error=str(e),
                elapsed_s=time.time() - start,
            )

        # 解析输出
        log_path = netlist_path.with_suffix(".log")
        raw_path = netlist_path.with_suffix(".raw")
        log_text = ""
        if log_path.exists():
            try:
                log_text = log_path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                pass

        # 检查成功：log 中应包含 "Total elapsed time" 且无致命错误
        success = "Total elapsed time" in log_text or proc.returncode == 0
        error_lines = []
        for line in (log_text + stdout + stderr).splitlines():
            l = line.strip()
            if l.lower().startswith(("error", "fatal", "cannot", "can't")):
                error_lines.append(l)
        error = "\n".join(error_lines[:10]) if error_lines else ""

        # 解析 .MEAS 结果
        measurements = self._parse_measurements(log_text)

        return SimulationResult(
            success=success,
            log_text=log_text,
            error_text=stderr,
            raw_path=raw_path if raw_path.exists() else None,
            log_path=log_path if log_path.exists() else None,
            elapsed_s=elapsed,
            measurements=measurements,
            error=error,
        )

    @staticmethod
    def _parse_measurements(log_text: str) -> dict:
        """从 .log 解析 .MEAS 结果"""
        measurements = {}
        # 匹配模式: name= value
        for m in re.finditer(r"^\s*(\w+)\s*=\s*([-+]?\d+\.?\d*(?:[eE][-+]?\d+)?)", log_text, re.MULTILINE):
            name, val = m.group(1), float(m.group(2))
            measurements[name] = val
        return measurements

    def parse_raw(self, raw_path: Path) -> dict:
        """解析 .raw 波形文件（ASCII 格式）

        Returns: {trace_name: {ivar: ndarray, dvar: ndarray}}

        Handles both real-only traces (".tran", ".dc") and complex
        traces (".ac").  For complex traces, each value is the
        pair "real,imag"; we store the magnitude (sqrt(re^2+im^2)) so
        downstream consumers (e.g. eval_cv's C = |I|/(2*pi*f*|V|)) can
        read a single float per datapoint.

        The layout in the file (when Flags include "complex"):
            0  v0_re, v0_im
                v1_re, v1_im
                ...
                v_(N-1)_re, v_(N-1)_im
            1  v0_re, v0_im
                ...
        i.e. the first column is the sweep variable, and each subsequent
        column-pair is one of the N-1 traces.
        """
        raw_path = Path(raw_path)
        if not raw_path.exists():
            return {}
        text = raw_path.read_text(encoding="utf-8", errors="ignore")
        lines = text.splitlines()

        is_complex = False
        n_vars = 0
        n_points = 0
        var_names = []
        data_start = None

        for i, line in enumerate(lines):
            if line.startswith("No. Variables:"):
                n_vars = int(line.split(":")[1].strip())
            elif line.startswith("No. Points:"):
                n_points = int(line.split(":")[1].strip())
            elif line.startswith("Flags:") and "complex" in line:
                is_complex = True
            elif line.strip() == "Variables:":
                for j in range(n_vars):
                    parts = lines[i + 1 + j].split()
                    if len(parts) >= 2:
                        var_names.append(parts[1])
                data_start = i + 1 + n_vars + 1
                break

        if data_start is None or not var_names:
            return {}

        def _parse_value(tok: str) -> float:
            """Parse a real or 're,im' complex value; return magnitude."""
            if "," in tok:
                try:
                    re, im = tok.split(",", 1)
                    return float((float(re) ** 2 + float(im) ** 2) ** 0.5)
                except ValueError:
                    return float("nan")
            try:
                return float(tok)
            except ValueError:
                return float("nan")

        result = {name: {"ivar": [], "dvar": []} for name in var_names[1:]}
        result["time"] = {"ivar": [], "dvar": []}  # 兼容旧调用

        cur_idx = -1
        cur_vals = []
        for line in lines[data_start:]:
            if not line.strip():
                continue
            parts = line.split()
            if not parts:
                continue
            try:
                # 检查是否是新的数据点（第一个值是 index）
                idx = int(parts[0])
                # 提交上一个数据点
                if cur_vals and idx == cur_idx + 1:
                    if len(cur_vals) == n_vars:
                        ivar_val = cur_vals[0]
                        for v_idx, vname in enumerate(var_names[1:], start=1):
                            if v_idx < len(cur_vals):
                                result[vname]["dvar"].append(cur_vals[v_idx])
                        for n in result:
                            result[n]["ivar"].append(ivar_val)
                cur_idx = idx
                cur_vals = []
                if len(parts) > 1:
                    for p in parts[1:]:
                        cur_vals.append(_parse_value(p))
            except ValueError:
                # 不是 index 行，是数据行
                for p in parts:
                    cur_vals.append(_parse_value(p))

        # 处理最后一个数据点
        if cur_vals and len(cur_vals) == n_vars:
            ivar_val = cur_vals[0]
            for v_idx, vname in enumerate(var_names[1:], start=1):
                if v_idx < len(cur_vals):
                    result[vname]["dvar"].append(cur_vals[v_idx])
            for n in result:
                result[n]["ivar"].append(ivar_val)

        # Convert lists to numpy arrays for downstream math
        for k, v in result.items():
            v["ivar"] = np.array(v["ivar"], dtype=float)
            v["dvar"] = np.array(v["dvar"], dtype=float)

        return result


# ============================================================
#  Netlist 生成器（常用模板）
# ============================================================

def gen_idvg_netlist(model_path: str,
                      vgs_min: float = 0.0,
                      vgs_max: float = 6.0,
                      vgs_step: float = 0.05,
                      vds_v: float = 0.05,
                      model_name: str = "nmos1",
                      use_subckt: bool = True) -> str:
    """生成 Id-Vg 扫描的 netlist

    Args:
        use_subckt: True=用 X<subckt_name> 调用，False=用 M<model_name> 直接调用
    """
    abs_path = Path(model_path).resolve()
    if use_subckt:
        x_line = f"X1 D G 0 {model_name}"
    else:
        x_line = f"M1 D G 0 0 {model_name}"
    return f"""* Id-Vg scan, Vds={vds_v}V
.include "{abs_path}"
{x_line}
Vds D 0 {vds_v}
Vgs G 0 0
.dc Vgs {vgs_min} {vgs_max} {vgs_step}
.print dc V(g) I(Vds)
.end
"""


def gen_idvd_netlist(model_path: str,
                      vds_max: float = 10.0,
                      vds_step: float = 0.05,
                      vgs_v: float = 10.0,
                      model_name: str = "nmos1",
                      use_subckt: bool = True) -> str:
    """生成 Id-Vd 扫描的 netlist"""
    abs_path = Path(model_path).resolve()
    if use_subckt:
        x_line = f"X1 D G 0 {model_name}"
    else:
        x_line = f"M1 D G 0 0 {model_name}"
    return f"""* Id-Vd scan, Vgs={vgs_v}V
.include "{abs_path}"
{x_line}
Vds D 0 0
Vgs G 0 {vgs_v}
.dc Vds 0 {vds_max} {vds_step}
.print dc V(d) I(Vds)
.end
"""


def gen_cv_netlist(model_path: str,
                   vds_max: float = 25.0,
                   vds_step: float = 0.5,
                   freq: float = 1e6,
                   model_name: str = "nmos1",
                   use_subckt: bool = True,
                   cap_type: str = "ciss") -> str:
    """生成 C-V 扫描的 netlist (3 种 cap_type 各自匹配测量)

    cap_type:
        ciss  - Iac 1A AC at gate, Rds_short 短 D 到地, 测 V(G_int)
                C = |I|/(omega*|V(G_int)|) = Cgs + Cgd
        coss  - Iac 1A AC at drain, Rgs_short 短 G 到地, 测 V(D_int)
                C = |I|/(omega*|V(D_int)|) = Cgd + Cds
        crss  - Iac 1A AC at drain, Rgs_short 短 G 到地, 测 V(D_int)
                C = |I|/(omega*|V(D_int)|) = Cgd (only)

    .step Vds 1..vds_max (skip 0; at Vds=0 the cap is fully discharged
    and Iac has nothing to flow through).  .ac list f runs AC at a
    single frequency f (1 MHz by default) so the output is a clean
    (nVds, nVars) matrix instead of cross-product.
    """
    abs_path = Path(model_path).resolve()
    if use_subckt:
        x_line = f"X1 D_int G_int 0 {model_name}"
    else:
        x_line = f"M1 D_int G_int 0 0 {model_name}"

    if cap_type == "ciss":
        return f"""* C-V Ciss: Iac on gate, drain shorted
.include "{abs_path}"
{x_line}
Rds_short D_int 0 0.001
Rgs_pull G_int 0 1G
Iac G_int 0 DC 0 AC 1 sin(0 1 {freq:g})
Vac D 0 DC 1 AC 1 sin(0 1 {freq:g})
.step param Vds 1 {vds_max} {vds_step}
.ac list {freq:g}
.print ac V(G_int) I(Iac)
.end
"""
    elif cap_type == "coss":
        return f"""* C-V Coss: Iac on drain, gate shorted
.include "{abs_path}"
{x_line}
Rgs_short G_int 0 0.001
Rds_pull D_int 0 1G
Iac D_int 0 DC 0 AC 1 sin(0 1 {freq:g})
Vac D 0 DC 1 AC 1 sin(0 1 {freq:g})
.step param Vds 1 {vds_max} {vds_step}
.ac list {freq:g}
.print ac V(D_int) I(Iac)
.end
"""
    elif cap_type == "crss":
        return f"""* C-V Crss: Iac on drain, gate shorted
.include "{abs_path}"
{x_line}
Rgs_short G_int 0 0.001
Iac D_int 0 DC 0 AC 1 sin(0 1 {freq:g})
Vac D 0 DC 1 AC 1 sin(0 1 {freq:g})
.step param Vds 1 {vds_max} {vds_step}
.ac list {freq:g}
.print ac V(D_int) I(Iac)
.end
"""
    else:
        raise ValueError(f"Unknown cap_type: {cap_type!r}; expected ciss|coss|crss")


# ============================================================
#  快速测试
# ============================================================

if __name__ == '__main__':
    exe = find_ltspice()
    print(f"LTspice found: {exe}")
    if exe:
        backend = LTspiceBackend(exe)
        print(f"Backend ready: {backend.ltspice_path}")
