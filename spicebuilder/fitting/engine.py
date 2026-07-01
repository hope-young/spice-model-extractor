"""
engine.py
=========
Engine - 多阶段拟合编排器（对标 Mystic Engine.extract）。

外层 max_loops 循环：跑完所有 Stage → 算总 RMS → 未达阈值 → 重头再跑。
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional
import numpy as np

from .stage import Stage, StageResult
from .optimizer import Optimizer


@dataclass
class EngineResult:
    success: bool
    total_rms: float
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

    def run(self, optimizer: Optimizer) -> EngineResult:
        """跑整个 pipeline

        外层循环：max_loops 次
        内层：按顺序跑所有 stage
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
                    iterations=loop_idx + 1,
                    stage_results=loop_results,  # 最后一次 loop 的结果
                    message=f"Converged in {loop_idx + 1} loop(s), RMS={loop_rms:.4f}",
                )

            # 检查是否还在改善
            if abs(prev_total_rms - loop_rms) < 1e-6:
                return EngineResult(
                    success=False,
                    total_rms=loop_rms,
                    iterations=loop_idx + 1,
                    stage_results=loop_results,
                    message=f"Converged (no improvement), RMS={loop_rms:.4f}",
                )
            prev_total_rms = loop_rms

        return EngineResult(
            success=False,
            total_rms=loop_rms,
            iterations=self.max_loops,
            stage_results=loop_results,
            message=f"Max loops reached, RMS={loop_rms:.4f} (target {self.error_threshold})",
        )
