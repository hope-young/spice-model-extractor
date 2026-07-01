"""
engine.py
=========
Engine - 多阶段拟合编排器（对标 Mystic Engine.extract）。

外层 max_loops 循环：跑完所有 Stage → 算总 RMS → 未达阈值 → 重头再跑。
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Optional
import numpy as np

from .stage import Stage, StageResult
from .optimizer import Optimizer


@dataclass
class EngineResult:
    success: bool
    total_rms: float
    r_squared: float            # log-domain R² over the LAST loop (>=0, <=1, 1 = perfect)
    iterations: int           # 外层循环次数
    stage_results: list[StageResult] = field(default_factory=list)
    message: str = ""


class Engine:
    """多阶段拟合编排

    用法:
        engine = Engine([stage1, stage2, stage3], error_threshold=2.0, max_loops=3)
        result = engine.run(optimizer)
    """

    def __init__(self,
                 stages: list[Stage],
                 error_threshold: float = 0.5,
                 max_loops: int = 3,
                 progress_callback: Optional[callable] = None):
        self.stages = stages
        self.error_threshold = error_threshold
        self.max_loops = max_loops
        # Optional callback notified after each stage completes.
        # Signature: cb(stage_name, stage_idx, total_stages, status, loop_idx, max_loops)
        # `status` is always "complete" for now (room to add "start" later).
        # Callbacks that raise are swallowed: a buggy reporter must not break the fit.
        self.progress_callback = progress_callback

    # ------------------------------------------------------------------
    #  Fit-quality helpers
    # ------------------------------------------------------------------

    def _aggregate_fitted_points(self) -> tuple[np.ndarray, np.ndarray]:
        """Flatten measured + fitted values from every stage's simdata.

        After stage.run() each SimData has .dvar (measurement) and .fit
        (latest simulator prediction).  We collect (log10 meas, log10 fit)
        across all stages so R² reflects the whole pipeline, not one stage.

        Only points where both meas and fit are strictly positive are kept
        (log is undefined otherwise).
        """
        meas_logs: List[np.ndarray] = []
        fit_logs: List[np.ndarray] = []
        for stage in self.stages:
            for sd in stage.simdata:
                if sd.dvar is None or sd.fit is None:
                    continue
                m = np.asarray(sd.dvar, dtype=float)
                f = np.asarray(sd.fit, dtype=float)
                mask = (m > 0) & (f > 0)
                if not mask.any():
                    continue
                meas_logs.append(np.log10(m[mask]))
                fit_logs.append(np.log10(f[mask]))
        if not meas_logs:
            return np.array([]), np.array([])
        return np.concatenate(meas_logs), np.concatenate(fit_logs)

    def _compute_r_squared(self) -> float:
        """Pipeline-wide R² as n-point-weighted mean of per-stage R².

        Why per-stage weighted mean instead of one pooled R²?
          The pipeline mixes IdVg/IdVd currents (A), C-V curves (pF),
          and body-diode Is (A) — pooling them in log domain produces a
          meaningless SST (the global mean gets dominated by whichever
          stage has the largest |log value|).  Computing one R² per stage
          and combining with weights proportional to that stage's point
          count gives a metric that actually tracks goodness of fit.
        """
        total_weight = 0
        weighted_sum = 0.0
        for stage in self.stages:
            meas_logs: List[np.ndarray] = []
            fit_logs: List[np.ndarray] = []
            for sd in stage.simdata:
                if sd.dvar is None or sd.fit is None:
                    continue
                m = np.asarray(sd.dvar, dtype=float)
                f = np.asarray(sd.fit, dtype=float)
                mask = (m > 0) & (f > 0)
                if not mask.any():
                    continue
                meas_logs.append(np.log10(m[mask]))
                fit_logs.append(np.log10(f[mask]))
            if not meas_logs:
                continue
            m_arr = np.concatenate(meas_logs)
            f_arr = np.concatenate(fit_logs)
            ss_res = float(np.sum((m_arr - f_arr) ** 2))
            ss_tot = float(np.sum((m_arr - m_arr.mean()) ** 2))
            if ss_tot <= 0:
                continue
            stage_r2 = max(0.0, 1.0 - ss_res / ss_tot)
            w = int(m_arr.size)
            weighted_sum += stage_r2 * w
            total_weight += w
        if total_weight == 0:
            return 0.0
        return weighted_sum / total_weight

    # ------------------------------------------------------------------

    def run(self, optimizer: Optimizer) -> EngineResult:
        """跑整个 pipeline

        外层循环：max_loops 次
        内层：按顺序跑所有 stage

        Returns EngineResult with both total_rms (log-domain NRMSE; lower is
        better, 0 = perfect) AND r_squared (1 = perfect).  Both are
        computed on the LAST loop's fit values only.
        """
        all_stage_results = []
        prev_total_rms = float('inf')
        total_stages = len(self.stages)

        for loop_idx in range(self.max_loops):
            loop_results = []
            total_rms_sq = 0.0
            n_points = 0

            for stage_idx, stage in enumerate(self.stages):
                result = stage.run(optimizer)
                loop_results.append(result)
                total_rms_sq += result.rms ** 2
                n_points += 1
                # Report progress after each stage completes.
                if self.progress_callback is not None:
                    try:
                        self.progress_callback(
                            stage.name, stage_idx, total_stages,
                            "complete", loop_idx, self.max_loops,
                        )
                    except Exception:
                        pass

            loop_rms = float(np.sqrt(total_rms_sq / max(1, n_points)))
            all_stage_results.extend(loop_results)

            # 收敛判据：loop RMS < threshold
            if loop_rms < self.error_threshold:
                return EngineResult(
                    success=True,
                    total_rms=loop_rms,
                    r_squared=self._compute_r_squared(),
                    iterations=loop_idx + 1,
                    stage_results=loop_results,  # 最后一次 loop 的结果
                    message=f"Converged in {loop_idx + 1} loop(s), RMS={loop_rms:.4f}",
                )

            # 检查是否还在改善
            if abs(prev_total_rms - loop_rms) < 1e-6:
                return EngineResult(
                    success=False,
                    total_rms=loop_rms,
                    r_squared=self._compute_r_squared(),
                    iterations=loop_idx + 1,
                    stage_results=loop_results,
                    message=f"Converged (no improvement), RMS={loop_rms:.4f}",
                )
            prev_total_rms = loop_rms

        return EngineResult(
            success=False,
            total_rms=loop_rms,
            r_squared=self._compute_r_squared(),
            iterations=self.max_loops,
            stage_results=loop_results,
            message=f"Max loops reached, RMS={loop_rms:.4f} (target {self.error_threshold})",
        )
