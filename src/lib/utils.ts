import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** 合并 tailwind class，处理冲突 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 生成短 ID（无需 uuid 依赖） */
export function uid(prefix = ""): string {
  const s =
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  return prefix ? `${prefix}_${s}` : s;
}

/** 保留 n 位小数 */
export function round(n: number, digits = 3): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

/** 数组洗牌（Fisher-Yates），返回新数组 */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 从数组随机抽取 n 个（不重复） */
export function sampleN<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, Math.min(n, arr.length));
}

/** 将数据导出为文件下载 */
export function downloadFile(filename: string, content: string, mime = "application/json") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 文件大小人类可读 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** 时间人类可读 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

/** 提取 JSON：从可能含前后说明文字的 LLM 输出中抽取首个 JSON 对象/数组 */
export function extractJson<T = unknown>(text: string): T | null {
  if (!text) return null;
  // 去掉 ```json ... ``` 代码块包裹
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1] : text;
  try {
    return JSON.parse(candidate.trim()) as T;
  } catch {
    // 尝试找首个 {...} 或 [...]
    const objStart = candidate.indexOf("{");
    const arrStart = candidate.indexOf("[");
    let start = -1;
    let open = "";
    let close = "";
    if (objStart >= 0 && (arrStart < 0 || objStart < arrStart)) {
      start = objStart;
      open = "{";
      close = "}";
    } else if (arrStart >= 0) {
      start = arrStart;
      open = "[";
      close = "]";
    }
    if (start < 0) return null;
    let depth = 0;
    let inStr = false;
    let escape = false;
    for (let i = start; i < candidate.length; i++) {
      const ch = candidate[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inStr = !inStr;
        continue;
      }
      if (inStr) continue;
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(candidate.slice(start, i + 1)) as T;
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }
}

/** 请求浏览器持久化存储，避免数据被清理 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const granted = await navigator.storage.persist();
      return granted;
    }
  } catch {
    /* ignore */
  }
  return false;
}
