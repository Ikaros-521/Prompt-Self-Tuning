import type { CaseResult, Dataset, Provider } from "./types";
import { runWithPrompt } from "./llm";
import { scoreCase, averageScore, passRate } from "./scoring";
import { clampConcurrency, poolWithEvents } from "./concurrency";

/** evaluatePrompt yield 的事件：每个样本完成时产出一条（result 非空） */
export interface EvalEvent {
  /** 原始样本下标 */
  index: number;
  /** 总样本数 */
  total: number;
  /** 本条结果；undefined 表示「开始/进度」占位（并发下已不产出占位，保留以兼容旧消费方） */
  result?: CaseResult;
}

/**
 * 评估：用给定 system prompt 在数据集上跑全量，逐条评分。
 * 用于「评估」页对比多个 prompt 版本的效果。
 *
 * 并发执行：最多 concurrency 个样本同时跑，每完成一条就 yield 一条结果，
 * 调用方可据此实时展示分数变化。yield 顺序 = 完成顺序（非下标顺序）。
 */
export async function* evaluatePrompt(
  provider: Provider,
  judge: Provider,
  prompt: string,
  dataset: Dataset,
  threshold: number,
  signal: AbortSignal,
  concurrency?: number,
): AsyncGenerator<EvalEvent, void, unknown> {
  const total = dataset.samples.length;
  for await (const ev of poolWithEvents(
    dataset.samples,
    clampConcurrency(concurrency),
    async (sample) => {
      const res = await runWithPrompt(
        provider,
        prompt,
        sample.input,
        sample.context,
        { temperature: provider.temperature ?? 0.3, signal },
      );
      const r = await scoreCase(
        judge,
        sample,
        res.content,
        threshold,
        signal,
      );
      return r;
    },
    signal,
    total,
  )) {
    yield {
      index: ev.index,
      total,
      result: { ...ev.result, index: ev.index },
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
