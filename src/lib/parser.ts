import type { DatasetFormat, Sample } from "./types";
import { extractJson } from "./utils";

export interface ParseResult {
  format: DatasetFormat;
  samples: Sample[];
  error?: string;
}

/**
 * 自动识别并解析训练集。
 *
 * 支持三种格式：
 * - jsonl: 每行一个 JSON 对象 {input, expected, context?}
 * - json:  JSON 数组 [{input, expected, context?}, ...]
 * - txt:   逐行编排，问答间用分隔符（默认 => 或 |）分隔
 */
export function parseDataset(raw: string): ParseResult {
  const text = raw.trim();
  if (!text) {
    return { format: "txt", samples: [], error: "内容为空" };
  }

  const format = detectFormat(text);
  switch (format) {
    case "json":
      return parseJson(text);
    case "jsonl":
      return parseJsonl(text);
    case "txt":
    default:
      return parseTxt(text);
  }
}

/** 检测格式：整体是 JSON 数组 → json；首行是 { 开头 → jsonl；否则 txt */
export function detectFormat(text: string): DatasetFormat {
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) return "json";
  // 检查首行是否像 JSON 对象
  const firstLine = trimmed.split(/\r?\n/)[0]?.trim() ?? "";
  if (firstLine.startsWith("{") && firstLine.endsWith("}")) return "jsonl";
  if (firstLine.startsWith("{")) return "jsonl";
  return "txt";
}

/** 字段名归一化：支持 input/question/prompt/q → input；expected/answer/output/a/expected_output → expected；context/background → context */
function normalizeField(obj: Record<string, unknown>): Sample | null {
  const get = (keys: string[]) => {
    for (const k of keys) {
      const found = Object.keys(obj).find(
        (fk) => fk.toLowerCase().trim() === k,
      );
      if (found && typeof obj[found] === "string") {
        const v = (obj[found] as string).trim();
        if (v) return v;
      }
    }
    return undefined;
  };

  const input = get([
    "input",
    "question",
    "prompt",
    "q",
    "query",
    "instruction",
  ]);
  const expected = get([
    "expected",
    "answer",
    "output",
    "a",
    "expected_output",
    "response",
    "target",
  ]);
  const context = get([
    "context",
    "background",
    "ctx",
    "passage",
    "document",
  ]);

  if (!input || !expected) return null;
  return { input, expected, context };
}

function parseJson(text: string): ParseResult {
  const arr = extractJson<unknown[]>(text);
  if (!Array.isArray(arr)) {
    return { format: "json", samples: [], error: "JSON 不是有效数组" };
  }
  const samples: Sample[] = [];
  let skipped = 0;
  for (const item of arr) {
    if (item && typeof item === "object") {
      const s = normalizeField(item as Record<string, unknown>);
      if (s) samples.push(s);
      else skipped++;
    }
  }
  if (samples.length === 0) {
    return {
      format: "json",
      samples: [],
      error: `未能识别字段（需要 input/question 与 expected/answer）。跳过 ${skipped} 条`,
    };
  }
  return { format: "json", samples };
}

function parseJsonl(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const samples: Sample[] = [];
  let skipped = 0;
  for (const line of lines) {
    const obj = extractJson<Record<string, unknown>>(line);
    if (obj && typeof obj === "object") {
      const s = normalizeField(obj);
      if (s) samples.push(s);
      else skipped++;
    } else {
      skipped++;
    }
  }
  if (samples.length === 0) {
    return {
      format: "jsonl",
      samples: [],
      error: `未能解析任何样本（每行需为含 input 与 expected 的 JSON）。跳过 ${skipped} 行`,
    };
  }
  return { format: "jsonl", samples };
}

/**
 * 解析 TXT 格式。
 * 约定：
 * - 默认按「问答分隔块」组织。一个块 = 一个样本。
 * - 块之间用空行分隔。
 * - 块内问答用分隔符分隔（自动探测 => 、 | 、 : 、 --- 、 Q:/A: 标记）。
 * - 若整段无空行、每行单条，则按行切分，取第一个分隔符分隔 Q/A。
 */
function parseTxt(text: string, delimiter?: string): ParseResult {
  const samples: Sample[] = [];
  const lines = text.split(/\r?\n/);

  // 探测分隔符
  const delim = delimiter ?? detectDelimiter(text);

  // 把文本按空行切分成块
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.trim() === "") {
      if (current.length) {
        blocks.push(current);
        current = [];
      }
    } else {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current);

  // 若只有单块且无空行，回退到按行解析
  const useLines = blocks.length <= 1 && lines.filter((l) => l.trim()).length > 1;

  const parseBlock = (blockLines: string[]): Sample | null => {
    const blockText = blockLines.join("\n");
    // 优先尝试 Q:/A: 标记风格
    const qaMark = blockText.match(
      /(?:Q|Question)[:：]\s*([\s\S]*?)\s*\n+(?:A|Answer|Response)[:：]\s*([\s\S]*)/i,
    );
    if (qaMark) {
      const ctxMatch = blockText.match(
        /(?:Context|Background)[:：]\s*([\s\S]*?)\s*\n+(?:Q|Question)[:：]/i,
      );
      return {
        input: qaMark[1].trim(),
        expected: qaMark[2].trim(),
        context: ctxMatch ? ctxMatch[1].trim() : undefined,
      };
    }
    // 分隔符风格
    if (delim) {
      const idx = blockText.indexOf(delim);
      if (idx >= 0) {
        const input = blockText.slice(0, idx).trim();
        const expected = blockText.slice(idx + delim.length).trim();
        if (input && expected) return { input, expected };
      }
    }
    return null;
  };

  if (useLines) {
    for (const line of lines) {
      if (!line.trim()) continue;
      const s = parseBlock([line]);
      if (s) samples.push(s);
    }
  } else {
    for (const block of blocks) {
      const s = parseBlock(block);
      if (s) samples.push(s);
    }
  }

  if (samples.length === 0) {
    return {
      format: "txt",
      samples: [],
      error: `未能解析样本。请确认问答间用分隔符（如 ${delim || "=>"}）分隔，或多块用空行隔开。`,
    };
  }
  return { format: "txt", samples };
}

/** 探测 TXT 分隔符 */
function detectDelimiter(text: string): string {
  const candidates = ["=>", "：", ":", "|", "---", " - ", "\t"];
  const counts = candidates.map((c) => {
    const m = text.match(new RegExp(escapeRegExp(c), "g"));
    return { c, n: m ? m.length : 0 };
  });
  counts.sort((a, b) => b.n - a.n);
  return counts[0] && counts[0].n > 0 ? counts[0].c : "=>";
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 指定分隔符重新解析（用户可在 UI 调整） */
export function reparseTxt(text: string, delimiter: string): ParseResult {
  return parseTxt(text, delimiter.trim() || undefined);
}
