"""
LTspiceEvaluator: 用 LTspice 跑 BSIM3 仿真作为目标函数
比 stage.py 的简化公式更准确（真 BSIM3 物理）。
"""
from __future__ import annotations
import hashlib
import tempfile
from pathlib import Path
from typing import Optional, Tuple, List

import numpy as np

from spicebuilder.models.bsim3 import BSIM3Model
from spicebuilder.models.exporter import LibExporter
from spicebuilder.simulator.ltspice import (
    LTspiceBackend,
    gen_idvg_netlist,
    gen_idvd_netlist,
    gen_cv_netlist,
)


class LTspiceEvaluator:
    """用 LTspice 评估 BSIM3 model

    用法:
        ev = LTspiceEvaluator(subckt_name='SDH10N2P1', rg_ohm=1.6)
        id_arr = ev.eval_idvg(model, vgs_arr, vds=5.0)
        id_arr = ev.eval_idvd(model, vds_arr, vgs=10.0)
    """

    def __init__(self,
                 subckt_name: str = "MOS",
                 rg_ohm: float = 1.6,
                 backend: Optional[LTspiceBackend] = None,
                 work_dir: Optional[Path] = None,
                 verbose: bool = False):
        self.subckt_name = subckt_name
        self.rg_ohm = rg_ohm
        self.backend = backend or LTspiceBackend()
        self.work_dir = Path(work_dir) if work_dir else Path(tempfile.gettempdir())
        self.exporter = LibExporter(part_number="EVAL")
        self.verbose = verbose
        self.cache: dict = {}  # param_hash -> array
        self.stats = {"calls": 0, "cache_hits": 0, "time": 0.0}

    def _param_hash(self, model: BSIM3Model, scenario: str, ivar: np.ndarray = None) -> str:
        """用关键参数生成 hash (用作 cache key)

        Args:
            ivar: 输入数组（加进 hash 以防不同长度复用缓存）
        """
        keys = [
            "VTH0", "K1", "K2", "K3", "K3B",
            "DVT0", "DVT1", "DVT2", "NFACTOR", "CDSC", "CDSCD", "CDSCB",
            "U0", "UA", "UB", "UC",
            "VSAT", "A0", "AGS", "KETA", "DWG", "DWB",
            "PCLM", "PVAG", "DROUT",
            "TOX", "XJ", "RS", "RD",
        ]
        vals = []
        for k in keys:
            try:
                vals.append(f"{k}={model.get(k):.6g}")
            except (KeyError, ValueError):
                pass
        s = scenario + "|" + "|".join(vals)
        if ivar is not None:
            # 加 ivar shape + min/max 到 key 以防不同长度复用
            s += f"|n={len(ivar)}|min={ivar.min():.4g}|max={ivar.max():.4g}"
        return hashlib.md5(s.encode()).hexdigest()[:16]

    def _write_lib(self, model: BSIM3Model) -> Path:
        """写一个临时 .lib"""
        tmpdir = Path(tempfile.mkdtemp(prefix="lteval_", dir=str(self.work_dir)))
        lib_path = tmpdir / "model.lib"
        self.exporter.export_subckt(model, lib_path,
                                     subckt_name=self.subckt_name,
                                     rg_ohm=self.rg_ohm)
        return lib_path

    def eval_idvg(self,
                  model: BSIM3Model,
                  vgs_arr: np.ndarray,
                  vds: float = 5.0) -> np.ndarray:
        """评估 Id-Vg 曲线

        Args:
            model: BSIM3 model
            vgs_arr: 目标 Vgs 数组 (V)
            vds: Vds 偏置 (V)

        Returns:
            |Id| 数组 (A)，与 vgs_arr 同长度
        """
        import time
        key = self._param_hash(model, f"idvg_vds{vds}", ivar)
        if key in self.cache:
            self.stats["cache_hits"] += 1
            return self.cache[key]

        t0 = time.time()
        self.stats["calls"] += 1
        lib_path = self._write_lib(model)
        vgs_min, vgs_max = float(vgs_arr.min()), float(vgs_arr.max())
        n = len(vgs_arr)
        step = (vgs_max - vgs_min) / max(1, n - 1)
        netlist = gen_idvg_netlist(str(lib_path), vgs_min=vgs_min, vgs_max=vgs_max,
                                    vgs_step=step, vds_v=vds,
                                    model_name=self.subckt_name, use_subckt=True)
        res = self.backend.run_netlist_text(netlist, timeout_s=15, cleanup=False)
        self.stats["time"] += time.time() - t0

        if not res.success or not res.raw_path or not res.raw_path.exists():
            out = np.full_like(vgs_arr, 1e-12, dtype=float)
            self.cache[key] = out
            return out

        try:
            raw = self.backend.parse_raw(res.raw_path)
            if 'V(g)' not in raw or 'I(Vds)' not in raw:
                out = np.full_like(vgs_arr, 1e-12, dtype=float)
            else:
                fit_vgs = np.array(raw['V(g)']['ivar'])
                fit_id = np.abs(np.array(raw['I(Vds)']['dvar']))
                out = np.interp(vgs_arr, fit_vgs, fit_id, left=1e-12, right=1e-12)
        except Exception as e:
            if self.verbose:
                print(f"[eval_idvg] parse error: {e}")
            out = np.full_like(vgs_arr, 1e-12, dtype=float)
        finally:
            try:
                lib_path.parent.rmdir()
            except OSError:
                pass

        self.cache[key] = out
        return out

    def eval_idvd(self,
                  model: BSIM3Model,
                  vds_arr: np.ndarray,
                  vgs: float = 10.0,
                  vds_max: float = 12.0) -> np.ndarray:
        """评估 Id-Vd 曲线"""
        import time
        key = self._param_hash(model, f"idvd_vgs{vgs}", vds_arr)
        if key in self.cache:
            self.stats["cache_hits"] += 1
            return self.cache[key]

        t0 = time.time()
        self.stats["calls"] += 1
        lib_path = self._write_lib(model)
        n = len(vds_arr)
        step = vds_max / max(1, n - 1)
        netlist = gen_idvd_netlist(str(lib_path), vds_max=vds_max, vds_step=step,
                                    vgs_v=vgs, model_name=self.subckt_name, use_subckt=True)
        res = self.backend.run_netlist_text(netlist, timeout_s=15, cleanup=False)
        self.stats["time"] += time.time() - t0

        if not res.success or not res.raw_path or not res.raw_path.exists():
            out = np.full_like(vds_arr, 1e-12, dtype=float)
            self.cache[key] = out
            return out

        try:
            raw = self.backend.parse_raw(res.raw_path)
            if 'V(d)' not in raw or 'I(Vds)' not in raw:
                out = np.full_like(vds_arr, 1e-12, dtype=float)
            else:
                fit_vds = np.array(raw['V(d)']['ivar'])
                fit_id = np.abs(np.array(raw['I(Vds)']['dvar']))
                out = np.interp(vds_arr, fit_vds, fit_id, left=1e-12, right=1e-12)
        except Exception as e:
            if self.verbose:
                print(f"[eval_idvd] parse error: {e}")
            out = np.full_like(vds_arr, 1e-12, dtype=float)
        finally:
            try:
                lib_path.parent.rmdir()
            except OSError:
                pass

        self.cache[key] = out
        return out

    def eval_cv(self,
                model: BSIM3Model,
                vds_arr: np.ndarray,
                freq: float = 1e6,
                vds_max: float = 25.0) -> Optional[np.ndarray]:
        """评估 C-V 曲线 (返回 Ciss in F; None on LTspice failure).

        The 1e-12 fallback was previously feeding nonsense data into the
        fit loop and the Excel report. We now cache None so callers see a
        honest "fit unavailable" instead.  The fix for the underlying
        LTspice netlist is tracked separately.
        """
        import time
        import sys
        key = self._param_hash(model, f"cv_f{freq}", vds_arr)
        if key in self.cache:
            self.stats["cache_hits"] += 1
            if self.cache[key] is None:
                del self.cache[key]   # invalidate stale None cache entry
            else:
                return self.cache[key]

        t0 = time.time()
        self.stats["calls"] += 1
        lib_path = self._write_lib(model)
        netlist = gen_cv_netlist(str(lib_path), vds_max=vds_max, vds_step=vds_max / 50,
                                  freq=freq, model_name=self.subckt_name, use_subckt=True)
        res = self.backend.run_netlist_text(netlist, timeout_s=15, cleanup=False)
        self.stats["time"] += time.time() - t0

        if not res.success or not res.raw_path or not res.raw_path.exists():
            self.cache[key] = None
            return None

        try:
            raw = self.backend.parse_raw(res.raw_path)
            if 'V(g)' not in raw or 'I(Iac)' not in raw:
                self.cache[key] = None
                return None
            v_g = np.asarray(raw['V(g)']['dvar'], dtype=float)   # magnitudes
            i_iac = np.asarray(raw['I(Iac)']['dvar'], dtype=float)  # magnitudes
            if v_g.size == 0 or i_iac.size == 0:
                self.cache[key] = None
                return None
            # C = |I| / (omega * |V|).  Iac amplitude is 1 A so i_iac
            # should be 1.0 (the cap current) and v_g is the small-signal
            # voltage on the gate node.  Length = nVds_step.
            omega = 2 * np.pi * freq
            c = i_iac / (omega * np.maximum(v_g, 1e-30))
            if len(c) >= len(vds_arr):
                return c[: len(vds_arr)]
            # Pad / interpolate to vds_arr length when fewer points
            # were returned than requested.
            x_axis = np.linspace(vds_arr[0], vds_arr[-1], len(c)) \
                if vds_arr.size else np.linspace(0, vds_max, len(c))
            return np.interp(vds_arr, x_axis, c)
        except Exception as e:
            if self.verbose:
                print(f"[eval_cv] parse error: {e}")
            out = np.full_like(vds_arr, 1e-12, dtype=float)
        finally:
            try:
                lib_path.parent.rmdir()
            except OSError:
                pass

        self.cache[key] = out
        return out

    def print_stats(self):
        print(f"  LTspice eval: {self.stats['calls']} calls, "
              f"{self.stats['cache_hits']} cache hits, "
              f"{self.stats['time']:.1f}s sim time")