import type { CaseResult, Provider, Sample } from "./types";
import { chat } from "./llm";
import { buildJudgePrompt } from "./metaPrompts";
import { extractJson, round } from "./utils";

/* ---------------- L1: 格式硬过滤 ---------------- */

/**
 * 格式检查：判断实际输出在「结构上」是否符合期望。
 * 这是一道廉价、确定性的预筛：
 *  - 期望输出是 JSON → 实际也必须能解析为 JSON
 *  - 期望输出是单行短文本 → 实际若包含大段多余文本扣分
 *  - 期望输出是纯代码/纯数字 → 做轻量校验
 *
 * 返回 passed 表示格式层面是否过关（不过关 → 直接判 0 分）。
 */
export function formatCheck(expected: string, actual: string): boolean {
  const exp = expected.trim();
  const act = actual.trim();
  if (!act) return false;

  // 期望是 JSON
  if (isJsonLike(exp)) {
    try {
      JSON.parse(exp);
    } catch {
      // 期望本身不是合法 JSON 也跳过
    }
    try {
      JSON.parse(stripCodeFence(act));
      return true;
    } catch {
      return false;
    }
  }

  // 期望是代码块
  if (/^```/.test(exp) || /(^|\n)\s*(function|def |class |import )/.test(exp)) {
    // 实际也应是代码（去掉包裹后非空）
    return stripCodeFence(act).trim().length > 0;
  }

  // 期望是纯数字
  if (/^-?\d+(\.\d+)?$/.test(exp)) {
    const m = act.match(/-?\d+(\.\d+)?/);
    return !!m;
  }

  // 期望是单行短答案（< 60 字符且无换行）
  if (exp.length < 60 && !exp.includes("\n")) {
    // 实际若过长且不含期望关键词，判为格式不符（多余解释）
    if (act.length > exp.length * 5 && !act.toLowerCase().includes(exp.toLowerCase())) {
      return false;
    }
  }

  return true;
}

function isJsonLike(s: string): boolean {
  const t = s.trim();
  return t.startsWith("{") || t.startsWith("[");
}

function stripCodeFence(s: string): string {
  const m = s.match(/```(?:\w+)?\s*([\s\S]*?)```/);
  return m ? m[1] : s;
}

/* ---------------- L3: LLM-as-Judge ---------------- */

export interface JudgeResult {
  score: number;
  reason?: string;
  failedDimensions?: string[];
}

/** 调用 judge 模型对单条输出评分（temperature=0 保证稳定） */
export async function llmJudge(
  provider: Provider,
  input: string,
  expected: string,
  actual: string,
  context?: string,
  signal?: AbortSignal,
): Promise<JudgeResult> {
  const res = await chat({
    provider,
    temperature: 0,
    signal,
    messages: [
      {
        role: "system",
        content:
          "你是一个严格、客观、长度中立的评分员。只输出 JSON，不要任何额外文字。",
      },
      {
        role: "user",
        content: buildJudgePrompt({ input, expected, actual, context }),
      },
    ],
  });

  const parsed = extractJson<{
    score?: number;
    reason?: string;
    failedDimensions?: string[];
  }>(res.content);

  if (!parsed || typeof parsed.score !== "number") {
    // judge 解析失败：降级为基于包含关系的粗略评分
    return fallbackJudge(expected, actual);
  }

  const score = Math.max(0, Math.min(1, Number(parsed.score)));
  return {
    score: round(score, 2),
    reason: parsed.reason,
    failedDimensions: Array.isArray(parsed.failedDimensions)
      ? parsed.failedDimensions
      : [],
  };
}

/** judge 失败时的兜底：基于期望输出是否被实际输出包含/近似 */
function fallbackJudge(expected: string, actual: string): JudgeResult {
  const exp = expected.trim().toLowerCase();
  const act = actual.trim().toLowerCase();
  if (!act) return { score: 0, reason: "空输出" };
  if (act === exp) return { score: 1, reason: "完全匹配（兜底）" };
  if (act.includes(exp)) return { score: 0.8, reason: "包含期望答案（兜底）" };
  if (exp.includes(act) && act.length > 3)
    return { score: 0.6, reason: "部分匹配（兜底）" };
  // 词重叠率
  const expWords = new Set(exp.split(/\s+/).filter(Boolean));
  const actWords = act.split(/\s+/).filter(Boolean);
  const overlap = actWords.filter((w) => expWords.has(w)).length;
  const ratio = expWords.size ? overlap / expWords.size : 0;
  return {
    score: round(Math.min(0.5, ratio), 2),
    reason: `词重叠 ${Math.round(ratio * 100)}%（兜底）`,
    failedDimensions: ["correctness"],
  };
}

/* ---------------- 组合评分：格式硬过滤 + Judge ---------------- */

/**
 * 标准两档评分：
 * 1. 先做格式硬过滤，格式不过关直接 0 分（节省 judge 调用）
 * 2. 格式过关则调用 LLM judge 得分
 *
 * threshold: 达到此分算「通过」
 */
export async function scoreCase(
  judgeProvider: Provider,
  sample: Sample,
  actual: string,
  threshold: number,
  signal?: AbortSignal,
): Promise<CaseResult> {
  const formatPassed = formatCheck(sample.expected, actual);

  let score = 0;
  let reason: string | undefined;
  let failedDimensions: string[] | undefined;

  if (formatPassed) {
    const judge = await llmJudge(
      judgeProvider,
      sample.input,
      sample.expected,
      actual,
      sample.context,
      signal,
    );
    score = judge.score;
    reason = judge.reason;
    failedDimensions = judge.failedDimensions;
  } else {
    reason = "格式不符（L1 硬过滤）";
    failedDimensions = ["format"];
  }

  return {
    index: 0, // 由调用方填充
    input: sample.input,
    context: sample.context,
    expected: sample.expected,
    actual,
    score: round(score, 2),
    formatPassed,
    reason,
    failedDimensions,
    passed: score >= threshold,
  };
}

/** 计算一组 case 的平均分 */
export function averageScore(results: CaseResult[]): number {
  if (results.length === 0) return 0;
  const sum = results.reduce((acc, r) => acc + r.score, 0);
  return round(sum / results.length, 3);
}

/** 通过率 */
export function passRate(results: CaseResult[], threshold: number): number {
  if (results.length === 0) return 0;
  const passed = results.filter((r) => r.score >= threshold).length;
  return round(passed / results.length, 3);
}
