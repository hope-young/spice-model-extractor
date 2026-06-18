// api.ts - Tauri invoke 封装

import { invoke } from "@tauri-apps/api/core";
import type {
  SpiceDataSet, BSIM3Model, FittingResult, LogEntry,
} from "./types";

/**
 * Tauri 后端调用封装（占位实现，待 subagent D 实现 Rust 端）
 */

// 加载数据
export async function loadData(filepath: string): Promise<SpiceDataSet> {
  try {
    return await invoke<SpiceDataSet>("load_data", { filepath });
  } catch (e) {
    console.warn("Tauri backend not available, using mock data:", e);
    return mockData();
  }
}

// 初始化 BSIM3 参数
export async function initBSIM3Model(deviceInfo: string): Promise<BSIM3Model> {
  try {
    return await invoke<BSIM3Model>("init_bsim3_model", { deviceInfo });
  } catch (e) {
    return mockModel();
  }
}

// 跑 6 阶段拟合
export async function runFitting(model: BSIM3Model, dataset: SpiceDataSet, opts?: {
  maxLoops?: number;
  errorThreshold?: number;
}): Promise<FittingResult> {
  try {
    return await invoke<FittingResult>("run_fitting", { model, dataset, opts });
  } catch (e) {
    return mockFitResult();
  }
}

// 导出 .lib
export async function exportLib(model: BSIM3Model, outputPath: string, subcktName: string): Promise<string> {
  try {
    return await invoke<string>("export_lib", { model, outputPath, subcktName });
  } catch (e) {
    return `mock: ${outputPath}`;
  }
}

// LTspice 回放
export async function runLTSpice(netlistPath: string, timeoutS?: number): Promise<string> {
  try {
    return await invoke<string>("run_ltspice", { netlistPath, timeoutS });
  } catch (e) {
    return "LTspice not available (mock)";
  }
}

// 启动 Python backend
export async function startBackend(): Promise<boolean> {
  try {
    return await invoke<boolean>("start_backend");
  } catch (e) {
    return false;
  }
}

// 停止 Python backend
export async function stopBackend(): Promise<void> {
  try {
    await invoke("stop_backend");
  } catch (e) {
    // ignore
  }
}

// 健康检查
export async function healthCheck(): Promise<{ backend: boolean; ltspice: boolean }> {
  try {
    return await invoke("health_check");
  } catch (e) {
    return { backend: false, ltspice: false };
  }
}

// 读取日志
export async function getLogs(): Promise<LogEntry[]> {
  try {
    return await invoke<LogEntry[]>("get_logs");
  } catch (e) {
    return [];
  }
}

// ============================================================
//  Mock 数据（后端未就绪时使用）
// ============================================================

function mockData(): SpiceDataSet {
  return {
    device_info: {
      part_number: "SDH10N2P1WC-AA",
      package: "PDFN5x6 (clip)",
      bvdss_v: 100,
      rdson_max_mohm: 2.1,
      id_rated_a: 100,
      vth_typ_v: 3.0,
    },
    key_params: {
      vth_25c_v: 3.0, dvth_dt_mv_per_c: -9.32,
      rdson_25c_10v_ohm: 1.85e-3, rdson_25c_6v_ohm: 2.4e-3, rdson_150c_10v_ohm: 3.9e-3,
      rdson_temp_coeff: 1.86, gfs_25c_s: 255.78,
      qg_on_20v_nc: 153.99, qg_on_50v_nc: 157.92, qgs_nc: 67.61, qgd_nc: 15.87, vgs_plateau_v: 4.87,
      ciss_25v_pf: 13122, coss_25v_pf: 4753, crss_25v_pf: 174,
      vsd_25c_v: 0.9, vsd_150c_v: 0.79,
      rg_internal_ohm: 1.6,
    },
    idvg_vds5: [],
    idvg_vds05: [],
    idvd: [],
    cv_vds: [],
    body_diode: [],
  };
}

function mockModel(): BSIM3Model {
  return {
    name: "nmos1",
    params: {
      VTH0: 3.0, K1: 0.5, K2: 0, DVT0: 2.2, DVT1: 0.53, NFACTOR: 1.0, CDSC: 2.4e-4,
      U0: 100, UA: 2e-9, UB: 5e-17, UC: 1e-10,
      VSAT: 1e5, A0: 1, AGS: 0, KETA: 0,
      PCLM: 0.5, PDIBLC1: 0.3, PDIBLC2: 0.05, DROUT: 0.5, PVAG: 1.0,
      CGSO: 1e-9, CGDO: 1e-9, CGBO: 1e-10,
      MJ: 0.5, MJSW: 0.33, PB: 0.8, PBSW: 0.8, TT: 1e-12,
      IS: 1e-12, N: 1.5, BV: 100, IBV: 1e-3,
    },
    fitted: {},
  };
}

function mockFitResult(): FittingResult {
  return {
    success: true,
    total_rms: 2.35,
    iterations: 1,
    stage_results: [
      { stage_name: "S1_Threshold", success: true, rms: 2.35, iterations: 48, fitted_params: { VTH0: 1.04 }, message: "converged" },
    ],
    message: "Mock fit complete",
  };
}
