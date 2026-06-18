"""FastAPI app entry point."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes import router

app = FastAPI(
    title="SpiceBuilder API",
    version="0.1.0",
    description="SPICE Model Extraction backend for Si SGT Power MOSFETs",
)

# CORS - 允许 Tauri / React 调用
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")


@app.get("/")
def root():
    return {
        "name": "SpiceBuilder API",
        "version": "0.1.0",
        "docs": "/docs",
    }
