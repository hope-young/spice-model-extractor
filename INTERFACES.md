# SpiceBuilder 模块接口规范

**本规范是 subagent 并行工作的契约**。所有 subagent 必须按本规范实现接口。

---

## 1. 已存在的模块（subagent 可以直接 import）

### `spicebuilder.data.loader_sdh`

```python
from spicebuilder.data.loader_sdh import (
    load_sdh_excel,     # (filepath) -> SpiceDataSet
    SpiceDataSet,       # 数据集
    DeviceInfo,         # 器件元数据
    SpiceKeyParams,     # 45 个关键 SPICE 参数（推 BSIM3 初值用）
)

@dataclass
class SpiceDataSet:
    device_info: DeviceInfo
    key_params: SpiceKeyParams
    idvg_vds5: list    # [{'vgs_v', 'id_a', 'vds_v', 'temperature_c'}, ...]
    idvg_vds05: list
    idvd: list         # [{'vds_v', 'id_a', 'vgs_v', 'temperature_c'}, ...]
    cv_vds: list       # [{'vds_v', 'ciss_pf', 'coss_pf', 'crss_pf'}, ...]
    body_diode: list   # [{'vsd_v', 'is_a', 'temperature_c', 'vgs_v'}, ...]
```

**关键参数字段**（SpiceKeyParams）：
- 阈值：`vth_25c_v`, `dvth_dT_mv_per_c`
- 导通电阻：`rdson_25c_10v_mohm`, `rdson_150c_10v_mohm`, `rdson_temp_coeff`
- 跨导：`gfs_25c_s`
- 栅电荷：`qg_on_20v_nc`, `qg_on_50v_nc`, `qgs_nc`, `qgd_nc`, `vgs_plateau_v`
- 电容：`ciss_25v_pf`, `coss_25v_pf`, `crss_25v_pf`
- 体二极管：`vsd_25c_v`, `vsd_150c_v`
- 热阻：`rthjc_c_per_w`
- 栅电阻：`rg_internal_ohm`

---

## 2. SimData 接口（即将由本文件实现）

```python
@dataclass
class SimData:
    """对标 Mystic.SimData，曲线数据 + 元数据 + 拟合结果"""
    name: str                           # 曲线名
    curve_type: str                     # "IdVg" / "IdVd" / "CvVds" / "Qg" / "IsVsd"
    data: dict[str, np.ndarray]         # {col_name: array} 必有 'ivar', 'dvar'
    metadata: dict                      # bias / temperature / instances
    
    ivar: np.ndarray                    # @property -> data['ivar']
    dvar: np.ndarray                    # @property -> data['dvar']
    fit: np.ndarray | None              # 拟合结果（None = 未拟合）
    
    @property
    def n_points(self) -> int
    
    def filter(self, op: str, value, dtype: str = "dvar") -> "SimData"
    def set_fit(self, fit: np.ndarray) -> None
    def compute_rms(self, error: str = "log") -> float
```

**curve_type 枚举**：
- `"IdVg"` - Id-Vg 曲线 (ivar=vgs_v, dvar=id_a)
- `"IdVd"` - Id-Vd 曲线 (ivar=vds_v, dvar=id_a)
- `"CvVds"` - C-V 曲线 (ivar=vds_v, dvar=ciss_pf 或 coss_pf 或 crss_pf)
- `"Qg"` - 栅电荷 (ivar=vgs_v, dvar=qg_nc)
- `"IsVsd"` - 体二极管 (ivar=vsd_v, dvar=is_a)

---

## 3. BSIM3 模型接口（subagent B 实现）

```python
from spicebuilder.models.bsim3 import (
    BSIM3Model,           # 模型对象
    BSIM3ParamSpec,       # 单个参数规格
    STAGE_PARAM_MAP,      # 阶段→参数映射
)

@dataclass
class BSIM3ParamSpec:
    name: str             # "VTH0" / "U0" / ...
    default: float        # 初始值
    lower: float          # 下界
    upper: float          # 上界
    unit: str             # "V" / "A/V^2" / ...
    category: str         # "Threshold" / "Mobility" / ...
    stage: str            # "S1" / "S2" / "S3" / "S5" / "S6"
    description: str

class BSIM3Model:
    def __init__(self, name: str = "nmos1"):
        # 30+ 个 BSIM3 参数，从 STAGE_PARAM_MAP 初始化
        ...
    
    def get(self, param: str) -> float
    def set(self, param: str, value: float) -> None
    def get_bounds(self, param: str) -> tuple[float, float]
    def get_params_by_stage(self, stage: str) -> list[str]  # ["VTH0", "K1", ...]
    def to_spice_card(self) -> str
        """输出 .model card 内容（不含 .model 行）"""
```

**6 阶段参数映射**（必须严格遵守）：
- **S1 Threshold**: VTH0, K1, K2, DVT0, DVT1, NFACTOR, CDSC
- **S2 Subthreshold**: NFACTOR, CDSCD, CDSCB
- **S3 Linear Mobility**: U0, UA, UB, UC
- **S4 Saturation**: VSAT, A0, AGS, KETA
- **S5 Output Res**: PCLM, PDIBLC1, PDIBLC2, DROUT, PVAG
- **S6 Capacitance**: CGBO, CGDO, CGSO, MJ, MJSW, PB, PBSW

---

## 4. Optimizer + Stage 接口（subagent C 实现）

```python
from spicebuilder.fitting.optimizer import Optimizer
from spicebuilder.fitting.stage import Stage, StageResult
from spicebuilder.fitting.error_funcs import rms_log, rms_linear

optimizer = Optimizer(method: str = "trf")  # "trf" / "lm" / "dogbox"
optimizer.set_eps1(1e-3)
optimizer.set_eps2(1e-3)
optimizer.set_eps3(1e-3)
optimizer.set_max_iter(1000)
result = optimizer.minimize(
    residual_func=lambda x: residual,  # (x) -> ndarray
    x0=np.array([...]),
    bounds=(lower, upper)
)

@dataclass
class StageResult:
    stage_name: str
    success: bool
    rms: float
    iterations: int
    fitted_params: dict[str, float]
    message: str

class Stage:
    def __init__(self, name: str, simdata: list[SimData], 
                 param_names: list[str], model: BSIM3Model,
                 error_func: str = "log"):  # "log" / "linear"
        ...
    def run(self, optimizer: Optimizer) -> StageResult
```

**误差函数**：
- `rms_log(measured, simulated)` - 对数 RMS（用于 Id-Vg, Id-Vd）
- `rms_linear(measured, simulated)` - 线性 RMS（用于 C-V, Qg, Body Diode）

---

## 5. LTspice Backend 接口（subagent D 实现）

```python
from spicebuilder.simulator.ltspice import LTspiceBackend, SimulationResult

backend = LTspiceBackend()  # 自动用 'ltspice' 命令（PATH 环境变量）
# 或指定路径：
backend = LTspiceBackend(ltspice_path="C:/Program Files/LTspiceXVII/XVIIx64.exe")

result = backend.run(
    netlist_path=Path("test.cir"),
    timeout_s=60,
)
# result.log_text, result.waveforms, result.measurements, result.success

backend.write_netlist(
    template="...spice...",
    output_path=Path("test.cir"),
    substitutions={"W": "1u", "L": "1u"},
)
```

**重要**：
- 必须用 `-b` 参数（无 GUI 批处理模式）
- 临时目录隔离，不污染用户工作区
- stdout/stderr 重定向
- 失败清晰报错

---

## 6. 6 阶段策略（subagent D 实现）

```python
from spicebuilder.strategy.sgt_6stage import build_sgt_engine

engine = build_sgt_engine(
    dataset: SpiceDataSet,
    model: BSIM3Model,
    optimizer: Optimizer,
)
# 包含 6 个 Stage，自动按顺序跑

# 跑：
from spicebuilder.fitting.engine import Engine
runner = Engine([stage1, stage2, ...], error_threshold=2.0, max_loops=3)
result = runner.run()  # 跑完所有 stage，外层 max_loops 循环
```

---

## 7. Exporter 接口（subagent B 实现）

```python
from spicebuilder.models.exporter import LibExporter

exporter = LibExporter()
# A 形式：纯 BSIM3 .model
exporter.export_bsim3(model, "output.lib", model_name="nmos1")
# B 形式：subckt 包装（默认推荐）
exporter.export_subckt(model, "output.lib", subckt_name="MY_MOSFET", 
                      include_diode=True, rg_ohm=1.6)
```

**B 形式输出格式**：
```spice
* SpiceBuilder Export - SDH10N2P1WC-AA
.SUBCKT MY_MOSFET D G S
M1 D_int G S S BSIM3_core L=1u W=1u
Rd D D_int 0.001
Rs S_int S 0.001
Rgate G_int G 1.6
Dbody S D Dbody_diode
.ENDS

.MODEL BSIM3_core NMOS LEVEL=49
+VTH0=2.34 ...
.END
```

---

## 8. 数据流（端到端）

```python
# 1. 加载数据
from spicebuilder.data.loader_sdh import load_sdh_excel
dataset = load_sdh_excel("data.xlsx")

# 2. 推 BSIM3 初始值
from spicebuilder.models.bsim3 import BSIM3Model
from spicebuilder.models.init_values import init_from_key_params
model = BSIM3Model()
init_from_key_params(model, dataset.key_params)

# 3. 建 SimData
from spicebuilder.data.simdata import SimData
idvg_sim = SimData.from_idvg(dataset.idvg_vds5, curve_type="IdVg", 
                              vds_v=5.0, temperature_c=25)
# ... 更多 SimData

# 4. 建拟合 stage
from spicebuilder.fitting.optimizer import Optimizer
from spicebuilder.fitting.stage import Stage
opt = Optimizer(method="trf")
s1 = Stage("S1_Threshold", [idvg_sim], 
           param_names=["VTH0", "K1", "K2", "NFACTOR"], 
           model=model, error_func="log")
s1.run(opt)

# 5. 导出
from spicebuilder.models.exporter import LibExporter
LibExporter().export_subckt(model, "out.lib")
```

**所有 subagent 必须严格按本规范实现接口，否则合并会失败。**
