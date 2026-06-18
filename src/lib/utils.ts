// utils.ts - 工具函数

export function cn(...args: (string | false | null | undefined)[]): string {
  return args.filter(Boolean).join(" ");
}

export function formatNumber(n: number, digits: number = 4): string {
  if (!isFinite(n)) return "—";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e6 || (abs < 1e-3 && abs > 0)) {
    return n.toExponential(2);
  }
  return n.toFixed(digits).replace(/\.?0+$/, "");
}

export function formatPercent(n: number, digits: number = 2): string {
  if (!isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

export function formatTime(timestamp: string): string {
  try {
    const d = new Date(timestamp);
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return timestamp;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// 颜色：根据 RMS 误差返回 success/warning/error
export function rmsColor(rms: number, threshold: number = 5): string {
  if (rms < 2) return "var(--success)";
  if (rms < threshold) return "var(--warning)";
  return "var(--error)";
}

// 截断字符串
export function truncate(s: string, max: number = 30): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

// 简易 csv 解析
export function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const parts = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = (parts[i] || "").trim()));
    return row;
  });
  return { headers, rows };
}
