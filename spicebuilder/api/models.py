"""Pydantic models for API requests/responses."""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any


class LoadProjectRequest(BaseModel):
    excel_path: str
    name: Optional[str] = None


class FitOptimizerConfig(BaseModel):
    method: str = "trf"
    eps1: float = 1e-3
    eps2: float = 1e-3
    eps3: float = 1e-3
    max_iter: int = 30
    parallel_jobs: int = 1


class FitRequest(BaseModel):
    stages: List[str] = Field(default_factory=lambda: ["S1", "S2", "S3", "S4", "S5", "S6"])
    max_loops: int = 3
    error_threshold: float = 10.0
    optimizer: FitOptimizerConfig = Field(default_factory=FitOptimizerConfig)


class ExportRequest(BaseModel):
    format: str = "B"  # "A" (pure BSIM3) or "B" (subckt wrapper)
    output_path: str
    rg_ohm: float = 1.6
    rd_ohm: Optional[float] = None
    rs_ohm: Optional[float] = None
    include_diode: bool = True


class HealthResponse(BaseModel):
    status: str
    version: str
    n_projects: int
    n_tasks: int


class LoadProjectResponse(BaseModel):
    project_id: str
    name: str
    device_info: Dict[str, Any]
    key_params: Dict[str, Any]
    curve_counts: Dict[str, int]


class FitResponse(BaseModel):
    task_id: str
    project_id: str
    status: str  # "queued" / "running" / "completed" / "failed"
    message: str = ""


class TaskInfo(BaseModel):
    id: str
    type: str
    status: str
    progress: float
    result: Dict[str, Any] = Field(default_factory=dict)
    error: str = ""
    created_at: str


class ModelParamInfo(BaseModel):
    name: str
    value: float
    initial: float
    fitted: bool
    category: str
    stage: str
    unit: str = ""
    description: str = ""


class ProjectModelResponse(BaseModel):
    project_id: str
    n_params: int
    n_fitted: int
    params: List[ModelParamInfo]


class ExportResponse(BaseModel):
    success: bool
    file_path: str
    n_bytes: int = 0


class CurveResponse(BaseModel):
    name: str
    curve_type: str
    data: Dict[str, List[float]]
    metadata: Dict[str, Any]


class ErrorResponse(BaseModel):
    error: str
    detail: str = ""
