# SpiceBuilder API

Python FastAPI 后端服务，为 Tauri+React GUI 提供 SPICE 模型提取能力。

## 启动

```bash
# 安装依赖
pip install -r requirements-api.txt

# 启动服务
python -m spicebuilder.api.scripts.run_api

# 或带参数
python -m spicebuilder.api.scripts.run_api --port 8000 --reload
```

默认监听 `http://127.0.0.1:8765`，文档在 `/docs`。

## Endpoints

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| POST | `/api/projects/load` | 加载 SDH Excel 工程 |
| GET | `/api/projects` | 列出所有工程 |
| GET | `/api/projects/{id}` | 工程详情 |
| POST | `/api/projects/{id}/fit` | 启动 6 阶段拟合（后台） |
| GET | `/api/tasks/{id}` | 查询任务状态 |
| GET | `/api/projects/{id}/model` | 获取 49 个 BSIM3 参数 |
| POST | `/api/projects/{id}/export` | 导出 .lib / .subckt |
| GET | `/api/projects/{id}/curves/{type}` | 获取原始测量数据 |

## 端到端流程

```bash
# 1. 加载工程
curl -X POST http://127.0.0.1:8765/api/projects/load \
  -H "Content-Type: application/json" \
  -d '{"excel_path": "datademo/SDH10N2P1WC-AA_SPICE_Data.xlsx"}'

# 返回: {"project_id": "uuid-...", "device_info": {...}, ...}

# 2. 启动拟合
curl -X POST http://127.0.0.1:8765/api/projects/{project_id}/fit \
  -H "Content-Type: application/json" \
  -d '{"max_loops": 3, "error_threshold": 5.0}'

# 返回: {"task_id": "uuid-...", "status": "queued"}

# 3. 查询任务进度
curl http://127.0.0.1:8765/api/tasks/{task_id}

# 返回: {"status": "running", "progress": 0.5, ...}

# 4. 获取拟合后参数
curl http://127.0.0.1:8765/api/projects/{project_id}/model

# 5. 导出 .lib
curl -X POST http://127.0.0.1:8765/api/projects/{project_id}/export \
  -H "Content-Type: application/json" \
  -d '{"format": "B", "output_path": "output.lib"}'
```

## 与 Tauri 集成

Tauri (Rust) 通过 HTTP 调用这些 endpoints：

```rust
// src-tauri/src/commands.rs
#[tauri::command]
async fn load_project(path: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let resp = client.post("http://127.0.0.1:8765/api/projects/load")
        .json(&serde_json::json!({"excel_path": path}))
        .send().await.map_err(|e| e.to_string())?;
    resp.text().await.map_err(|e| e.to_string())
}
```

或者 Tauri 在启动时自动 spawn Python 进程（sidecar 模式）。

## 文件结构

```
spicebuilder/api/
├── __init__.py
├── models.py           # Pydantic 模型
├── state.py            # 全局状态 (Project, Task, State)
├── routes.py           # 8+ 路由
├── server.py           # FastAPI app
└── scripts/
    └── run_api.py      # 启动脚本
```

## 数据流

```
[Tauri+React] 
    ↓ HTTP POST /api/projects/load
[FastAPI] 
    ↓ load_sdh_excel()
[SpiceDataSet + BSIM3Model]
    ↓
[POST /api/projects/{id}/fit]
    ↓ asyncio.create_task()
[后台 CPU bound]
    ↓ scipy.optimize.least_squares
[Fitted BSIM3Model]
    ↓
[GET /api/projects/{id}/model] → React 表格显示
    ↓
[POST /api/projects/{id}/export] → 写 .lib 文件
    ↓
[Tauri 调用 LTspice 验证 .lib]
```
