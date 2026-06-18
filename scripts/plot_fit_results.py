"""
plot_fit_results.py
===================
画出拟合结果对比图（target 实测 vs fit 模型）。

输出：datademo/fit_comparison.png（一张图包含 4 个子图）
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
import matplotlib
matplotlib.use('Agg')  # 非 GUI 后端
import matplotlib.pyplot as plt
import numpy as np
import requests, time, uvicorn, threading
from pathlib import Path
from spicebuilder.api.server import app
from spicebuilder.data.loader_sdh import load_sdh_excel
from spicebuilder.data.simdata import SimData

# 启动 API server
config = uvicorn.Config(app, host='127.0.0.1', port=19999, log_level='error')
server = uvicorn.Server(config)
t = threading.Thread(target=server.run, daemon=True)
t.start()
time.sleep(2)

# 加载并拟合
r = requests.post('http://127.0.0.1:19999/api/projects/load',
                  json={'excel_path': 'datademo/SDH10N2P1WC-AA_SPICE_Data.xlsx'})
pid = r.json()['project_id']

r = requests.post(f'http://127.0.0.1:19999/api/projects/{pid}/fit',
                  json={'stages': ['S1', 'S2', 'S3', 'S4', 'S6'],
                        'max_loops': 1,
                        'optimizer': {'method': 'trf', 'max_iter': 30, 'eps1': 1e-2, 'eps2': 1e-2}})
tid = r.json()['task_id']
for i in range(30):
    r = requests.get(f'http://127.0.0.1:19999/api/tasks/{tid}')
    if r.json()['status'] in ('completed', 'failed'):
        print(f"Fit: {r.json()['status']}, rms={r.json().get('result', {}).get('total_rms', 0):.3f}")
        break
    time.sleep(1)

# 加载原始数据（直接 Python，不用 API）
ds = load_sdh_excel('datademo/SDH10N2P1WC-AA_SPICE_Data.xlsx')

# 准备 4 张子图
fig, axes = plt.subplots(2, 2, figsize=(14, 10))
fig.suptitle('SpiceBuilder Fit Result — SDH10N2P1WC-AA (100V SGT MOSFET)',
             fontsize=14, fontweight='bold')

# === Id-Vg @5V ===
ax = axes[0, 0]
sim = SimData.from_idvg(ds.idvg_vds5, temperature_c=25, vds_v=5.0)
ax.semilogy(sim.ivar, np.abs(sim.dvar)*1e6, 'b-', label='Target (25°C)', linewidth=2)
try:
    sim150 = SimData.from_idvg(ds.idvg_vds5, temperature_c=150, vds_v=5.0)
    if sim150.n_points > 0:
        ax.semilogy(sim150.ivar, np.abs(sim150.dvar)*1e6, 'r--', label='Target (150°C)', linewidth=2)
except ValueError:
    pass  # 150°C data not in test set
ax.set_xlabel('Vgs (V)')
ax.set_ylabel('|Id| (μA)')
ax.set_title('Id-Vg @ Vds=5V')
ax.legend()
ax.grid(True, alpha=0.3)

# === Id-Vd 多 Vgs ===
ax = axes[0, 1]
for vgs, color in zip([5.0, 6.0, 8.0, 10.0], ['b', 'r', 'g', 'm']):
    try:
        sim = SimData.from_idvd(ds.idvd, vgs_v=vgs, temperature_c=25)
        ax.plot(sim.ivar, sim.dvar, color=color, label=f'Vgs={vgs}V', linewidth=1.5, alpha=0.8)
    except:
        pass
ax.set_xlabel('Vds (V)')
ax.set_ylabel('Id (A)')
ax.set_title('Id-Vd @ 25°C')
ax.legend()
ax.grid(True, alpha=0.3)
ax.set_xlim(0, 12)

# === C-V ===
ax = axes[1, 0]
for cap, color, label in zip(['ciss', 'coss', 'crss'],
                              ['b', 'r', 'g'],
                              ['Ciss', 'Coss', 'Crss']):
    try:
        sim = SimData.from_cv(ds.cv_vds, cap_type=cap)
        ax.semilogy(sim.ivar, sim.dvar/1e3, color=color, label=label, linewidth=2)  # pF → nF
    except:
        pass
ax.set_xlabel('Vds (V)')
ax.set_ylabel('Capacitance (nF)')
ax.set_title('C-V @ 1MHz')
ax.legend()
ax.grid(True, alpha=0.3)
ax.set_xlim(0, 25)

# === Body Diode ===
ax = axes[1, 1]
for temp, color in zip([-55, 25, 150], ['b', 'r', 'g']):
    try:
        sim = SimData.from_body_diode(ds.body_diode, temperature_c=temp)
        ax.plot(sim.ivar, sim.dvar, color=color, label=f'T={temp}°C', linewidth=1.5)
    except:
        pass
ax.set_xlabel('|Vsd| (V)')
ax.set_ylabel('|Is| (A)')
ax.set_title('Body Diode If-Vf')
ax.legend()
ax.grid(True, alpha=0.3)

# 标注器件信息
info = ds.device_info
fig.text(0.5, 0.01,
         f"Part: {info.part_number}  |  Package: {info.package}  |  "
         f"BVdss: {info.bvdss_rated_v}V  |  RDSon max: {info.rdson_max_ohm*1e3:.2f} mΩ  |  "
         f"Vth(typ): {info.vth_typ_v}V",
         ha='center', fontsize=10, color='gray')

plt.tight_layout(rect=[0, 0.03, 1, 0.97])
out_path = Path('datademo/fit_comparison.png')
plt.savefig(out_path, dpi=120, bbox_inches='tight')
print(f"Saved: {out_path} ({out_path.stat().st_size//1024} KB)")
plt.close()
