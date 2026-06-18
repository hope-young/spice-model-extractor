"""Global state for SpiceBuilder API server."""
from dataclasses import dataclass, field
from typing import Dict, Optional
import asyncio
import uuid
from datetime import datetime


@dataclass
class Project:
    id: str
    name: str
    dataset: object  # SpiceDataSet
    model: object    # BSIM3Model
    simdata_cache: Dict = field(default_factory=dict)
    created_at: str = ""


@dataclass
class Task:
    id: str
    type: str
    status: str  # "queued" / "running" / "completed" / "failed"
    progress: float = 0.0
    result: dict = field(default_factory=dict)
    error: str = ""
    created_at: str = ""
    project_id: str = ""


class State:
    projects: Dict[str, Project] = {}
    tasks: Dict[str, Task] = {}


state = State()
