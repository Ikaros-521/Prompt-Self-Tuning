import type { CaseResult, Dataset, Provider } from "./types";
import { runWithPrompt } from "./llm";
import { scoreCase, averageScore, passRate } from "./scoring";

/**
 * 评估：用给定 system prompt 在数据集上跑全量，逐条评分。
 * 用于「评估」页对比多个 prompt 版本的效果。
 */
export async function* evaluatePrompt(
  provider: Provider,
  judge: Provider,
  prompt: string,
  dataset: Dataset,
  threshold: number,
  signal: AbortSignal,
): AsyncGenerator<{ index: number; total: number; result?: CaseResult }, void, unknown> {
  const total = dataset.samples.length;
  for (let i = 0; i < total; i++) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    yield { index: i, total };
    const res = await runWithPrompt(
      provider,
      prompt,
      dataset.samples[i].input,
      dataset.samples[i].context,
      { temperature: provider.temperature ?? 0.3, signal },
    );
    const r = await scoreCase(
      judge,
      dataset.samples[i],
      res.content,
      threshold,
      signal,
    );
    yield {
      index: i,
      total,
      result: { ...r, index: i },
    };
  }
}

export interface EvalSummary {
  promptId: string;
  avgScore: number;
  passRate: number;
  results: CaseResult[];
}

/** 汇总单次评估结果 */
export function summarizeEval(
  promptId: string,
  results: CaseResult[],
  threshold: number,
): EvalSummary {
  return {
    promptId,
    avgScore: averageScore(results),
    passRate: passRate(results, threshold),
    results,
  };
}
