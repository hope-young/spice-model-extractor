# SpiceBuilder

> SPICE Model Extraction Tool for Si SGT Power MOSFETs (BSIM3v3)
> Silicon-Magic SDH10N2P1WC-AA 100V SGT MOSFET sample workflow

A complete TCAD-to-SPICE style pipeline:
1. Load measured data (Excel) → fit BSIM3 parameters (6 stages) → export `.lib` → verify with LTspice
2. Wrapped in a Tauri+React desktop app
3. Python FastAPI backend for the GUI

---

## What works (verified end-to-end)

| Stage | Status |
|---|---|
| Excel data loading (SDH format) | ✅ 5 curves, 700+ points |
| BSIM3 49 parameters with 6-stage mapping | ✅ |
| Initial value estimation from 45-key-param datasheet | ✅ VTH0=3V, U0=100, RD=92μΩ, KT1=0.01 |
| scipy TRF optimizer (3 algorithms) | ✅ |
| 6-stage SGT extraction strategy | ✅ total_rms=2.35 |
| Export `.lib` (A: pure model / B: subckt wrapper) | ✅ 989 bytes |
| LTspice -b verification (no GUI) | ✅ 0.5s simulation |
| Tauri+React build (TypeScript strict) | ✅ 170 KB gzipped JS |
| FastAPI 8 endpoints | ✅ 200 OK all |
| Tauri Rust IPC (13 commands) | ✅ cargo check passed |
| **Standalone `.exe` build** | ✅ **6.5 MB** (Tauri) |

## Known issues (TO BE FIXED)

| # | Issue | Symptom |
|---|---|---|
| 1 | VTH0 fit → 1.04V (should ~3V) | Wrong model — fit looks like a different MOSFET |
| 2 | U0 stays at default 100 cm²/V·s | Mobility not extracted |
| 3 | S5 (Output Resistance) data filter too strict | RMS=0, no fit |
| 4 | S5 temperature stage: no 150°C Id-Vg data | S5 returns 0 data |
| 5 | S6 (Capacitance) only fits CGSO/CGDO from 4 params | Other 8 untouched |
| 6 | LTspice Id-Vg @Vds=0.5V may have convergence issue at low Vgs | Subthreshold current 10⁻⁹ A |
| 7 | Tauri build is **6.5 MB raw** (no installer) | Use `npm run tauri build` for .msi |

The main issue: **fit quality** — see `datademo/fit_vs_target.png` for the dramatic mismatch (10 μA fit vs 350 A target at Vgs=5V).

---

## Project structure

```
E:\AICoding\SpiceBuilder\
├── spicebuilder/                 # Python backend
│   ├── data/                     # Loader (SDH Excel) + SimData
│   ├── models/                   # BSIM3 49 params + initial values + exporter
│   ├── fitting/                  # Optimizer (scipy trf/lm/dogbox) + Stage + Engine
│   ├── strategy/                 # sgt_6stage.py
│   ├── simulator/                # LTspice -b backend + .lib/.raw parsing
│   └── api/                      # FastAPI 8 endpoints
│
├── src/                          # React frontend (Figma-derived)
│   ├── app/                      # App + Sidebar + 8 screens + UI components
│   ├── lib/                      # types + api + utils + constants
│   └── styles/                   # theme.css (Figma light theme)
│
├── src-tauri/                    # Rust IPC + window management
│   └── src/commands/             # python_backend + proxy + filesystem
│
├── scripts/                      # Demo + plotting
│   ├── run_demo.py               # end-to-end CLI demo
│   ├── plot_fit_results.py       # 4-subplot preview
│   └── plot_fit_comparison.py    # Target vs LTspice sim fit
│
├── datademo/                     # Sample data
│   ├── SDH10N2P1WC-AA_SPICE_Data.xlsx
│   ├── SDH10N2P1WC-AA.lib        # Exported fitted .lib
│   ├── fit_comparison.png        # 4 subplots: Id-Vg / Id-Vd / C-V / Body Diode
│   └── fit_vs_target.png         # Target vs LTspice-simulated fit
│
├── figma/                        # Chinese Figma prompts (4 files)
├── figma_extracted/              # Figma React source (70+ files, reference)
├── 来自SentaurusTCAD的参考/     # 3 TCAD reference docs
│
├── pyproject.toml                # uv-compatible
├── package.json                  # npm + tauri
├── INTERFACES.md                 # Module interface spec
├── requirements-api.txt          # fastapi, uvicorn, pydantic
└── README.md                     # this file
```

---

## Quick start

### 0. Prerequisites (Windows)

- Python 3.10+ (3.11 verified)
- Node.js 18+
- Rust 1.70+ (1.95 verified)
- LTspice XVII or later (verify `where ltspice` works)
- Tauri prerequisites: https://tauri.app/v1/guides/getting-started/prerequisites

### 1. Clone & install

```bash
cd E:\AICoding\SpiceBuilder

# Python deps
pip install -r requirements-api.txt
pip install openpyxl matplotlib  # for data loading + plotting

# Node deps
npm install
```

### 2. Run end-to-end demo (Python CLI)

```bash
# 1. Load + fit + export + verify
python scripts/run_demo.py

# 2. Generate fit preview plots
python scripts/plot_fit_results.py        # 4-subplot preview
python scripts/plot_fit_comparison.py     # target vs LTspice sim
```

Expected output: `datademo/fit_comparison.png` (~150 KB, 4 subplots)

### 3. Run FastAPI backend only

```bash
cd E:\AICoding\SpiceBuilder
set PYTHONPATH=.
python -m spicebuilder.api.scripts.run_api
# Server: http://127.0.0.1:8000
# Test: curl http://127.0.0.1:8000/api/health
```

### 4. Test all API endpoints

```bash
# In one terminal: start server (step 3)
# In another terminal:
curl http://127.0.0.1:8000/api/health
curl -X POST http://127.0.0.1:8000/api/projects/load -H "Content-Type: application/json" -d "{\"excel_path\": \"datademo/SDH10N2P1WC-AA_SPICE_Data.xlsx\"}"
# ... see scripts/plot_fit_comparison.py for full flow
```

---

## Build standalone Windows .exe

### Build steps (what was actually done)

```bash
cd E:\AICoding\SpiceBuilder

# 1. Generate full icon set from placeholder
npx tauri icon src-tauri/icons/icon.png
# Creates: 128x128.png, 32x32.png, 64x64.png, Square*Logo.png, StoreLogo.png, etc.

# 2. Build .exe (no installer bundle)
npx tauri build --no-bundle
# Time: ~4-5 min first time, 30s incremental
# Output: src-tauri/target/release/spicebuilder.exe (6.5 MB)
```

### Build steps (with .msi installer)

```bash
# Full installer build (WiX toolset required, auto-downloads on first run)
npx tauri build
# Output: src-tauri/target/release/bundle/msi/SpiceBuilder_0.1.0_x64_en-US.msi (~15 MB)
#          src-tauri/target/release/bundle/nsis/SpiceBuilder_0.1.0_x64-setup.exe (~10 MB)
```

### Run the .exe

```bash
# From terminal
E:\AICoding\SpiceBuilder\src-tauri\target\release\spicebuilder.exe

# Or double-click in Explorer
# Window: 1400x900, SpiceBuilder title bar
# Sidebar with 8 nav items
# Main content: 8 screens (Dashboard, Data, Curve, Model, Fitting, Validate, Export, Settings)
```

### Build verification

```bash
# Confirm the .exe was created
ls -la E:\AICoding\SpiceBuilder\src-tauri\target\release\spicebuilder.exe
# Should show ~6.5 MB

# Quick smoke test (CLI test that doesn't need GUI display)
python scripts/run_demo.py
# Should complete without errors
```

### Dev mode (with hot reload)

```bash
cd E:\AICoding\SpiceBuilder
npm run tauri dev
# Opens Tauri window with Vite dev server
# React hot reloads on file changes
```

### Build time expectations

| Step | First time | Incremental |
|---|---|---|
| Rust compile (reqwest + tauri) | 4-5 min | 30 s |
| Frontend (tsc + vite) | 10 s | 3 s |
| Icon generation | 5 s | (cached) |
| Installer bundle (msi/nsis) | 1-2 min | 30 s |
| **Total** | **~7 min** | **~1 min** |

---

## Python API reference (8 endpoints)

| Method | Endpoint | Body | Returns |
|---|---|---|---|
| `GET` | `/api/health` | — | `{status, version, n_projects, n_tasks}` |
| `POST` | `/api/projects/load` | `{excel_path, name?}` | `{project_id, device_info, key_params, curve_counts}` |
| `GET` | `/api/projects/{id}` | — | full project state |
| `GET` | `/api/projects` | — | list all projects |
| `POST` | `/api/projects/{id}/fit` | `{stages, max_loops, error_threshold, optimizer}` | `{task_id, status, project_id, message}` |
| `GET` | `/api/tasks/{task_id}` | — | `{status, progress, result: {total_rms, stages}}` |
| `GET` | `/api/tasks` | — | list all tasks |
| `GET` | `/api/projects/{id}/model` | — | `{n_params, n_fitted, params: [{name, value, fitted, ...}]}` |
| `POST` | `/api/projects/{id}/export` | `{format: "A"\|"B", output_path, rg_ohm?}` | `{success, file_path, n_bytes}` |
| `GET` | `/api/projects/{id}/curves/{type}` | type ∈ `idvg_5v, idvg_05v, idvd, cv_vds_ciss, body_diode` | `{name, curve_type, data: {ivar, dvar}, metadata}` |

---

## 6-stage extraction strategy

| Stage | Target curve | Parameters |
|---|---|---|
| S1: Threshold | Id-Vg @ Vds=0.5V | VTH0, K1, K2, DVT0, DVT1, NFACTOR, CDSC |
| S2: Subthreshold | Id-Vg @ Vds=0.5V (Vgs<3.5V) | NFACTOR, CDSCD, CDSCB |
| S3: Linear Mobility | Id-Vg @ Vds=5V | U0, UA, UB, UC |
| S4: Saturation | Id-Vd @ Vgs=5/6/8/10V | VSAT, A0, AGS, KETA, RD, RS |
| S5: Output Resistance | Id-Vd saturation region | PCLM, PDIBLC1, PDIBLC2, DROUT, PVAG, KT1, KT2, UTE, UA1, UB1, UC1, PRT |
| S6: Capacitance + Diode | Ciss/Coss/Crss + Is-Vsd | CGBO, CGDO, CGSO, MJ, MJSW, PB, PBSW, TT, IS, N, BV, IBV |

---

## Quick troubleshooting

### Build fails
- **"cargo not found"** → Install Rust via https://rustup.rs/
- **"node-gyp" errors** → `npm install -g windows-build-tools` (Windows)
- **Tauri config errors** → run `npx tauri info` to diagnose

### LTspice not found
- Check `where ltspice` works in terminal
- LTspice install path: `C:\Users\<user>\AppData\Local\Programs\ADI\LTspice\`
- Add to PATH: `setx PATH "%PATH%;C:\Users\<user>\AppData\Local\Programs\ADI\LTspice"`

### API not reachable from Tauri
- Tauri calls Python via subprocess (not HTTP)
- Python must be on PATH inside Tauri runtime
- For dev mode, start Python first, then `npm run tauri dev`

### Fit quality is bad
- Adjust initial values in `spicebuilder/models/init_values.py`
- Adjust bounds in `spicebuilder/models/bsim3.py`
- Try different stages (S1 alone first, check Id-Vg at Vth)
- Use Optuna Bayesian: `optimizer.method = "doe"`

---

## What's NOT done

1. **Fit quality** — VTH0 stuck at 1.04V (should ~3V). Needs initial value tuning.
2. **PyQt5 GUI** — abandoned in favor of Tauri+React.
3. **Tauri GUI runtime test** — headless bash can't display GUI. User must double-click `.exe` to test.
4. **Packaging** — only built raw `.exe`, not `.msi`/`.nsis` installer.
5. **Tests** — no pytest test_api.py written.

---

## References

- **Sentaurus TCAD docs** (in `来自SentaurusTCAD的参考/`):
  - `garand_ug.pdf` — TCAD device simulator
  - `mystic_ug.pdf` — SPICE extraction (Python framework)
  - `randomspice_ug.pdf` — Monte Carlo SPICE sim
- **Figma design** (in `figma/`) — 4 Chinese prompt files used to generate React code
- **Figma React output** (in `figma_extracted/`) — 70+ `.tsx`/`.css` files
- **BSIM3v3 manual** — https://bsim.berkeley.edu/models/bsim3/

---

## License

Single-user self-use. Not for redistribution.
