"""FastAPI routes for SpiceBuilder."""
from datetime import datetime
from typing import Optional
import asyncio
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException

from .state import state, Project, Task
from .models import (
    LoadProjectRequest, FitRequest, ExportRequest,
    LoadProjectResponse, FitResponse, TaskInfo, ProjectModelResponse,
    ExportResponse, CurveResponse, ModelParamInfo, HealthResponse,
)

from spicebuilder.data.loader_sdh import load_sdh_excel
from spicebuilder.data.simdata import SimData
from spicebuilder.models.bsim3 import BSIM3Model, PARAM_SPECS
from spicebuilder.models.init_values import init_from_key_params
from spicebuilder.fitting.optimizer import Optimizer
from spicebuilder.strategy.sgt_6stage import build_sgt_engine
from spicebuilder.models.exporter import LibExporter

router = APIRouter()


# ============================================================
#  Health
# ============================================================

@router.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse(
        status="ok",
        version="0.1.0",
        n_projects=len(state.projects),
        n_tasks=len(state.tasks),
    )


# ============================================================
#  Projects - load
# ============================================================

@router.post("/projects/load", response_model=LoadProjectResponse)
def load_project(req: LoadProjectRequest):
    try:
        ds = load_sdh_excel(req.excel_path)
    except FileNotFoundError:
        raise HTTPException(404, f"Excel file not found: {req.excel_path}")
    except Exception as e:
        raise HTTPException(400, f"Load failed: {e}")

    model = BSIM3Model()
    try:
        init_from_key_params(model, ds.key_params)
    except Exception as e:
        raise HTTPException(500, f"Init values failed: {e}")

    project_id = str(uuid.uuid4())
    name = req.name or ds.device_info.part_number
    state.projects[project_id] = Project(
        id=project_id,
        name=name,
        dataset=ds,
        model=model,
        created_at=datetime.now().isoformat(),
    )

    return LoadProjectResponse(
        project_id=project_id,
        name=name,
        device_info={
            "part_number": ds.device_info.part_number,
            "package": ds.device_info.package,
            "bvdss_v": ds.device_info.bvdss_rated_v,
            "rdson_max_mohm": ds.device_info.rdson_max_ohm * 1e3,
            "id_rated_a": ds.device_info.id_rated_a,
            "vth_typ_v": ds.device_info.vth_typ_v,
        },
        key_params={
            "vth_25c_v": ds.key_params.vth_25c_v,
            "rdson_25c_10v_mohm": ds.key_params.rdson_25c_10v_ohm * 1e3,
            "rdson_150c_10v_mohm": ds.key_params.rdson_150c_10v_ohm * 1e3,
            "qg_on_20v_nc": ds.key_params.qg_on_20v_nc,
            "ciss_25v_pf": ds.key_params.ciss_25v_pf,
            "coss_25v_pf": ds.key_params.coss_25v_pf,
            "crss_25v_pf": ds.key_params.crss_25v_pf,
            "rg_ohm": ds.key_params.rg_internal_ohm,
        },
        curve_counts={
            "idvg_5v": len(ds.idvg_vds5),
            "idvg_05v": len(ds.idvg_vds05),
            "idvd": len(ds.idvd),
            "cv_vds": len(ds.cv_vds),
            "body_diode": len(ds.body_diode),
        },
    )


@router.get("/projects/{project_id}")
def get_project(project_id: str):
    project = state.projects.get(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return {
        "project_id": project.id,
        "name": project.name,
        "created_at": project.created_at,
    }


# ============================================================
#  Fitting - run + task tracking
# ============================================================

def _run_fit_sync(project: Project, req: FitRequest, task: Task):
    """CPU-bound fit in sync context (run in executor)."""
    ds = project.dataset
    model = project.model

    # Optimizer
    opt = Optimizer(method=req.optimizer.method)
    opt.set_eps1(req.optimizer.eps1)
    opt.set_eps2(req.optimizer.eps2)
    opt.set_eps3(req.optimizer.eps3)
    opt.set_max_iter(req.optimizer.max_iter)

    # Engine
    task.progress = 0.1
    engine = build_sgt_engine(
        dataset=ds, model=model, optimizer=opt,
        error_threshold=req.error_threshold,
        max_loops=req.max_loops,
        verbose=False,
    )

    task.progress = 0.3
    result = engine.run(opt)

    task.progress = 0.9
    task.result = {
        "success": result.success,
        "total_rms": float(result.total_rms),
        "iterations": int(result.iterations),
        "message": result.message,
        "stages": [
            {"name": sr.stage_name, "rms": float(sr.rms), "success": bool(sr.success)}
            for sr in result.stage_results
        ],
    }
    task.progress = 1.0


async def _fit_task_wrapper(project_id: str, req: FitRequest, task_id: str):
    project = state.projects.get(project_id)
    task = state.tasks.get(task_id)
    if not project or not task:
        return
    loop = asyncio.get_event_loop()
    try:
        task.status = "running"
        await loop.run_in_executor(None, _run_fit_sync, project, req, task)
        task.status = "completed"
    except Exception as e:
        task.status = "failed"
        task.error = str(e)
        task.progress = 1.0


@router.post("/projects/{project_id}/fit", response_model=FitResponse)
async def start_fit(project_id: str, req: FitRequest):
    project = state.projects.get(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    task_id = str(uuid.uuid4())
    state.tasks[task_id] = Task(
        id=task_id,
        type="fit",
        status="queued",
        project_id=project_id,
        created_at=datetime.now().isoformat(),
    )

    # 调度后台任务
    asyncio.create_task(_fit_task_wrapper(project_id, req, task_id))

    return FitResponse(
        task_id=task_id,
        project_id=project_id,
        status="queued",
        message="Fit task started",
    )


@router.get("/tasks/{task_id}", response_model=TaskInfo)
def get_task(task_id: str):
    task = state.tasks.get(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    return TaskInfo(
        id=task.id,
        type=task.type,
        status=task.status,
        progress=task.progress,
        result=task.result,
        error=task.error,
        created_at=task.created_at,
    )


# ============================================================
#  Model - get current parameters
# ============================================================

@router.get("/projects/{project_id}/model", response_model=ProjectModelResponse)
def get_model(project_id: str):
    project = state.projects.get(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    model = project.model
    spec_map = {s.name: s for s in PARAM_SPECS}
    fitted = model.is_fitted() if hasattr(model, 'is_fitted') else set()
    initial = model.get_initial() if hasattr(model, 'get_initial') else {}

    params = []
    n_fitted = 0
    for name in sorted(model.to_dict().keys()):
        val = model.get(name)
        spec = spec_map.get(name)
        is_fit = name in fitted
        if is_fit:
            n_fitted += 1
        params.append(ModelParamInfo(
            name=name,
            value=float(val),
            initial=float(initial.get(name, val)),
            fitted=is_fit,
            category=spec.category if spec else "default",
            stage=spec.stage if spec else "",
            unit=spec.unit if spec else "",
            description=spec.description if spec else "",
        ))

    return ProjectModelResponse(
        project_id=project_id,
        n_params=len(params),
        n_fitted=n_fitted,
        params=params,
    )


# ============================================================
#  Export - write .lib
# ============================================================

@router.post("/projects/{project_id}/export", response_model=ExportResponse)
def export_project(project_id: str, req: ExportRequest):
    project = state.projects.get(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    exporter = LibExporter(part_number=project.dataset.device_info.part_number)
    try:
        if req.format.upper() == "A":
            path = exporter.export_bsim3(project.model, req.output_path)
        else:
            path = exporter.export_subckt(
                project.model, req.output_path,
                subckt_name=project.name,
                rg_ohm=req.rg_ohm,
                rd_ohm=req.rd_ohm,
                rs_ohm=req.rs_ohm,
                include_diode=req.include_diode,
            )
    except Exception as e:
        raise HTTPException(500, f"Export failed: {e}")

    n_bytes = path.stat().st_size if path.exists() else 0
    return ExportResponse(
        success=True,
        file_path=str(path.resolve()),
        n_bytes=n_bytes,
    )


# ============================================================
#  Curves - get raw measurement data
# ============================================================

@router.get("/projects/{project_id}/curves/{curve_type}", response_model=CurveResponse)
def get_curve(project_id: str, curve_type: str, vgs_v: Optional[float] = None):
    project = state.projects.get(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    ds = project.dataset
    try:
        if curve_type == "idvg_5v":
            sim = SimData.from_idvg(ds.idvg_vds5, temperature_c=25, vds_v=5.0)
        elif curve_type == "idvg_05v":
            sim = SimData.from_idvg(ds.idvg_vds05, temperature_c=25, vds_v=0.5)
        elif curve_type == "idvg_05v_t150":
            sim = SimData.from_idvg(ds.idvg_vds05, temperature_c=150, vds_v=0.5)
        elif curve_type == "idvd":
            v = vgs_v if vgs_v is not None else 10.0
            sim = SimData.from_idvd(ds.idvd, vgs_v=v, temperature_c=25)
        elif curve_type == "cv_vds_ciss":
            sim = SimData.from_cv(ds.cv_vds, cap_type='ciss')
        elif curve_type == "cv_vds_coss":
            sim = SimData.from_cv(ds.cv_vds, cap_type='coss')
        elif curve_type == "cv_vds_crss":
            sim = SimData.from_cv(ds.cv_vds, cap_type='crss')
        elif curve_type == "body_diode":
            sim = SimData.from_body_diode(ds.body_diode, temperature_c=25)
        else:
            raise HTTPException(400, f"Unknown curve_type: {curve_type}")
    except Exception as e:
        raise HTTPException(400, f"Curve error: {e}")

    return CurveResponse(
        name=sim.name,
        curve_type=sim.curve_type,
        data={
            "ivar": sim.ivar.tolist(),
            "dvar": sim.dvar.tolist(),
        },
        metadata={k: (v if isinstance(v, (int, float, str, bool, list)) else str(v))
                  for k, v in sim.metadata.items()},
    )


# ============================================================
#  List projects / tasks
# ============================================================

@router.get("/projects")
def list_projects():
    return {
        "projects": [
            {"id": p.id, "name": p.name, "created_at": p.created_at}
            for p in state.projects.values()
        ]
    }


@router.get("/tasks")
def list_tasks():
    return {
        "tasks": [
            {"id": t.id, "type": t.type, "status": t.status, "progress": t.progress}
            for t in state.tasks.values()
        ]
    }
