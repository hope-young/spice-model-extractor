"""
plot_fit_comparison.py
======================
用 LTspice 仿真拟合后的 .lib，画 target vs fit 对比图。
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import requests, time, uvicorn, threading
from pathlib import Path
from spicebuilder.api.server import app
from spicebuilder.data.loader_sdh import load_sdh_excel
from spicebuilder.data.simdata import SimData
from spicebuilder.simulator.ltspice import LTspiceBackend, gen_idvg_netlist, gen_idvd_netlist

# === 1. 启动 API server ===
config = uvicorn.Config(app, host='127.0.0.1', port=19999, log_level='error')
server = uvicorn.Server(config)
t = threading.Thread(target=server.run, daemon=True)
t.start()
time.sleep(2)

# === 2. 加载 + 拟合 + 导出 ===
r = requests.post('http://127.0.0.1:19999/api/projects/load',
                  json={'excel_path': 'datademo/SDH10N2P1WC-AA_SPICE_Data.xlsx'})
pid = r.json()['project_id']

r = requests.post(f'http://127.0.0.1:19999/api/projects/{pid}/fit',
                  json={'stages': ['S1', 'S2', 'S3', 'S4', 'S6'],
                        'max_loops': 1,
                        'optimizer': {'method': 'trf', 'max_iter': 30}})
tid = r.json()['task_id']
for i in range(30):
    r = requests.get(f'http://127.0.0.1:19999/api/tasks/{tid}')
    if r.json()['status'] in ('completed', 'failed'):
        print(f"Fit: {r.json()['status']}, rms={r.json().get('result', {}).get('total_rms', 0):.3f}")
        break
    time.sleep(1)

# 导出 .lib
lib_path = 'datademo/SDH10N2P1WC-AA.lib'
r = requests.post(f'http://127.0.0.1:19999/api/projects/{pid}/export',
                  json={'format': 'B', 'output_path': lib_path, 'rg_ohm': 1.6})
print(f"Export: {r.json()}")

# === 3. 用 LTspice 仿真 .lib ===
backend = LTspiceBackend()
print("LTspice:", backend.ltspice_path)

# 3a. Id-Vg @Vds=0.5V
print("\nSimulating Id-Vg @Vds=0.5V...")
netlist = gen_idvg_netlist(lib_path, vgs_min=0, vgs_max=5, vgs_step=0.1, vds_v=0.5,
                          model_name='SDH10N2P1', use_subckt=True)
res = backend.run_netlist_text(netlist, timeout_s=30)
print(f"  Success: {res.success}, elapsed: {res.elapsed_s:.2f}s")

# 解析 Id-Vg 结果（从 .raw）
fit_vgs_05 = None
fit_id_05 = None
if res.success and res.raw_path:
    raw = backend.parse_raw(res.raw_path)
    if 'V(g)' in raw:
        fit_vgs_05 = np.array(raw['V(g)']['ivar'])
        fit_id_05 = np.array(raw['I(Vds)']['dvar'])

# 3b. Id-Vg @Vds=5V
print("Simulating Id-Vg @Vds=5V...")
netlist = gen_idvg_netlist(lib_path, vgs_min=0, vgs_max=5, vgs_step=0.1, vds_v=5.0,
                          model_name='SDH10N2P1', use_subckt=True)
res = backend.run_netlist_text(netlist, timeout_s=30)
fit_vgs_5 = None
fit_id_5 = None
if res.success and res.raw_path:
    raw = backend.parse_raw(res.raw_path)
    if 'V(g)' in raw:
        fit_vgs_5 = np.array(raw['V(g)']['ivar'])
        fit_id_5 = np.array(raw['I(Vds)']['dvar'])

# === 4. 加载原始 target 数据 ===
ds = load_sdh_excel('datademo/SDH10N2P1WC-AA_SPICE_Data.xlsx')
target_05 = SimData.from_idvg(ds.idvg_vds05, temperature_c=25, vds_v=0.5)
target_5 = SimData.from_idvg(ds.idvg_vds5, temperature_c=25, vds_v=5.0)

# === 5. 画 target vs fit 对比图 ===
fig, axes = plt.subplots(1, 2, figsize=(14, 6))
fig.suptitle('SpiceBuilder: Target vs LTspice-Simulated Fit (BSIM3 6-stage)',
             fontsize=14, fontweight='bold')

# Id-Vg @ Vds=0.5V
ax = axes[0]
ax.semilogy(target_05.ivar, np.abs(target_05.dvar)*1e6, 'b-', label='Target (measured)', linewidth=2, marker='.', markersize=3)
if fit_vgs_05 is not None:
    ax.semilogy(fit_vgs_05, np.abs(fit_id_05)*1e6, 'r--', label='Fit (LTspice sim)', linewidth=2, alpha=0.8)
ax.set_xlabel('Vgs (V)', fontsize=12)
ax.set_ylabel('|Id| (μA)', fontsize=12)
ax.set_title('Id-Vg @ Vds=0.5V, 25°C\n(subthreshold region)', fontsize=13)
ax.legend(fontsize=11)
ax.grid(True, alpha=0.3)
ax.set_ylim(1e-3, 1e6)

# Id-Vg @ Vds=5V
ax = axes[1]
ax.semilogy(target_5.ivar, np.abs(target_5.dvar)*1e6, 'b-', label='Target (measured)', linewidth=2, marker='.', markersize=3)
if fit_vgs_5 is not None:
    ax.semilogy(fit_vgs_5, np.abs(fit_id_5)*1e6, 'r--', label='Fit (LTspice sim)', linewidth=2, alpha=0.8)
ax.set_xlabel('Vgs (V)', fontsize=12)
ax.set_ylabel('|Id| (μA)', fontsize=12)
ax.set_title('Id-Vg @ Vds=5V, 25°C\n(strong inversion region)', fontsize=13)
ax.legend(fontsize=11)
ax.grid(True, alpha=0.3)
ax.set_ylim(1e-3, 1e8)

# 标注
info = ds.device_info
fig.text(0.5, -0.02,
         f"Part: {info.part_number}  |  BSIM3v3 LEVEL=49  |  6-stage extraction  |  LTspice -b mode",
         ha='center', fontsize=10, color='gray')

plt.tight_layout()
out_path = Path('datademo/fit_vs_target.png')
plt.savefig(out_path, dpi=120, bbox_inches='tight')
print(f"\nSaved: {out_path} ({out_path.stat().st_size//1024} KB)")

# 显示 RMS
if fit_vgs_05 is not None:
    # 插值到相同 Vgs 点
    common = np.intersect1d(target_05.ivar, fit_vgs_05)
    if len(common) > 0:
        target_interp = np.interp(common, target_05.ivar, target_05.dvar)
        fit_interp = np.interp(common, fit_vgs_05, fit_id_05)
        mask = (target_interp > 0) & (fit_interp > 0)
        rms = np.sqrt(np.mean((np.log10(fit_interp[mask]) - np.log10(target_interp[mask]))**2))
        print(f"  Id-Vg @0.5V RMS (log): {rms:.4f}")
plt.close()
