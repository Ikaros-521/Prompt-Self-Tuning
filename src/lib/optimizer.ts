import type {
  CaseResult,
  Dataset,
  OptimizeConfig,
  OptimizerEvent,
  Provider,
  PromptVersion,
  RoundRecord,
  Sample,
} from "./types";
import { runWithPrompt, chat } from "./llm";
import { averageScore, scoreCase } from "./scoring";
import {
  buildDecisionPrompt,
  buildReflectPrompt,
  buildRewritePrompt,
  buildSeedPrompt,
  type DecisionResult,
  type ReflectResult,
} from "./metaPrompts";
import { extractJson, sampleN, uid } from "./utils";

/**
 * 优化引擎（GEPA 工程简化版）。
 *
 * 异步 generator：每完成一个步骤就 yield 一个事件，UI 层据此实时更新。
 * 调用方通过 AbortSignal 停止。一轮循环：采样 → 测试 → 评分 → 反思 → 改写 → 验证选优。
 *
 * 重要：执行-评分在 generator 顶层逐样本循环，因此 case_done / testing 进度
 * 能真正实时 yield（不能在回调里 yield）。
 */

export interface OptimizerDeps {
  dataset: Dataset;
  executor: Provider;
  judge: Provider;
  config: OptimizeConfig;
  signal: AbortSignal;
}

export interface OptimizerContext {
  rounds: RoundRecord[];
  bestScore: number;
  /** 当前最优版本 id（基线或本次采纳过的最优） */
  bestVersionId?: string;
  currentPrompt: string;
  /** 本次种子/基线版本（用户选定的起点，与成果版本分离：不计入本次成果、不参与防退化计数） */
  baselineVersion?: PromptVersion;
  /** 本次新采纳的成果版本（不含基线） */
  adoptedVersions: PromptVersion[];
  totalTokens: number;
}

/** 训练/验证集划分（保证 dev 至少 1 条） */
function splitDataset(
  samples: Sample[],
  trainRatio: number,
): { train: Sample[]; dev: Sample[] } {
  const n = samples.length;
  const devCount = Math.max(1, Math.round(n * (1 - trainRatio)));
  const trainCount = Math.max(1, n - devCount);
  return {
    train: samples.slice(0, trainCount),
    dev: samples.slice(trainCount),
  };
}

/** 生成种子 prompt
 * - initialPrompt 非空：直接用作种子（跳过生成），source = 'user'
 * - 否则 userGuidance 非空：带着用户意图调 seed agent 生成，source = 'guided'
 * - 否则：纯自动生成，source = 'auto'
 */
async function generateSeed(
  meta: Provider,
  samples: Sample[],
  signal: AbortSignal,
  initialPrompt?: string,
  userGuidance?: string,
): Promise<{ prompt: string; tokens: number; source: "user" | "guided" | "auto" }> {
  // 用户直接给了初版 → 直接用，不调 LLM
  if (initialPrompt?.trim()) {
    return { prompt: initialPrompt.trim(), tokens: 0, source: "user" };
  }

  const seedSamples = sampleN(samples, Math.min(5, samples.length));
  const res = await chat({
    provider: meta,
    temperature: 0.7,
    signal,
    messages: [
      {
        role: "system",
        content: "你是资深 Prompt Engineer。只输出 JSON，不要额外说明。",
      },
      { role: "user", content: buildSeedPrompt(seedSamples, userGuidance) },
    ],
  });
  const parsed = extractJson<{ system_prompt?: string }>(res.content);
  const prompt =
    parsed?.system_prompt?.trim() ||
    `你是一个专业的助手。请根据用户的输入，给出准确、简洁的回答。`;
  return {
    prompt,
    tokens: res.tokensIn + res.tokensOut,
    source: userGuidance?.trim() ? "guided" : "auto",
  };
}

/** 反思 */
async function reflect(
  meta: Provider,
  currentPrompt: string,
  failures: CaseResult[],
  successes: CaseResult[],
  signal: AbortSignal,
): Promise<{ result: ReflectResult; tokens: number }> {
  const res = await chat({
    provider: meta,
    temperature: 0.3,
    signal,
    messages: [
      { role: "system", content: "你是严谨的 Prompt 评审专家。只输出 JSON。" },
      {
        role: "user",
        content: buildReflectPrompt(
          currentPrompt,
          failures.map((f) => ({
            input: f.input,
            context: f.context,
            expected: f.expected,
            actual: f.actual,
            score: f.score,
            reason: f.reason,
            failedDimensions: f.failedDimensions,
          })),
          successes.map((s) => ({
            input: s.input,
            context: s.context,
            expected: s.expected,
            actual: s.actual,
            score: s.score,
            reason: s.reason,
            failedDimensions: s.failedDimensions,
          })),
        ),
      },
    ],
  });
  const parsed = extractJson<ReflectResult>(res.content) ?? {};
  return { result: parsed, tokens: res.tokensIn + res.tokensOut };
}

/** 改写 */
async function rewrite(
  meta: Provider,
  currentPrompt: string,
  reflectResult: ReflectResult,
  signal: AbortSignal,
): Promise<{ newPrompt: string; changes: string[]; tokens: number }> {
  const res = await chat({
    provider: meta,
    temperature: 0.7,
    signal,
    messages: [
      { role: "system", content: "你是资深 Prompt Engineer。只输出 JSON。" },
      {
        role: "user",
        content: buildRewritePrompt(currentPrompt, reflectResult),
      },
    ],
  });
  const parsed = extractJson<{
    new_prompt?: string;
    changes?: string[];
  }>(res.content);
  const newPrompt = parsed?.new_prompt?.trim() || currentPrompt;
  const changes = Array.isArray(parsed?.changes) ? parsed!.changes : [];
  return { newPrompt, changes, tokens: res.tokensIn + res.tokensOut };
}

/** Agent 决策 */
async function decide(
  meta: Provider,
  history: { round: number; devScore: number; changes?: string[] }[],
  threshold: number,
  signal: AbortSignal,
): Promise<{ result: DecisionResult | null; tokens: number }> {
  const res = await chat({
    provider: meta,
    temperature: 0,
    signal,
    messages: [
      { role: "system", content: "你是优化过程决策者。只输出 JSON。" },
      { role: "user", content: buildDecisionPrompt(history, threshold) },
    ],
  });
  const parsed = extractJson<DecisionResult>(res.content);
  return { result: parsed, tokens: res.tokensIn + res.tokensOut };
}

function summarizeReflect(r: ReflectResult): string {
  const parts: string[] = [];
  if (r.failure_modes?.length)
    parts.push(`失败模式: ${r.failure_modes.join(", ")}`);
  if (r.root_causes?.length) parts.push(`根因: ${r.root_causes.join("; ")}`);
  if (r.suggestions?.length) parts.push(`建议: ${r.suggestions.join("; ")}`);
  return parts.join(" | ") || "无明显失败模式";
}

/**
 * 主优化流程。meta agent（反思/改写/决策）默认用 executor。
 */
export async function* runOptimization(
  deps: OptimizerDeps,
): AsyncGenerator<OptimizerEvent, void, unknown> {
  const { dataset, executor, judge, config, signal } = deps;
  const meta = executor;

  const ctx: OptimizerContext = {
    rounds: [],
    bestScore: 0,
    bestVersionId: undefined,
    currentPrompt: "",
    baselineVersion: undefined,
    adoptedVersions: [],
    totalTokens: 0,
  };

  const checkAbort = () => {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  };

  try {
    yield {
      type: "init",
      message: `数据集 ${dataset.samples.length} 条，执行模型 ${executor.model}`,
    };

    const { train, dev } = splitDataset(dataset.samples, config.trainRatio);
    yield {
      type: "info",
      message: `划分：训练集 ${train.length} 条 / 验证集 ${dev.length} 条`,
    };

    // —— 1. 种子 prompt ——
    const seedMsg =
      config.initialPrompt?.trim()
        ? "使用用户提供的初版提示词…"
        : config.userGuidance?.trim()
          ? "按用户需求描述引导生成种子提示词…"
          : "正在生成种子提示词…";
    yield { type: "info", message: seedMsg };
    checkAbort();
    const seed = await generateSeed(
      meta,
      dataset.samples,
      signal,
      config.initialPrompt,
      config.userGuidance,
    );
    ctx.currentPrompt = seed.prompt;
    ctx.totalTokens += seed.tokens;

    // 一拿到种子就立即暴露，让「当前提示词」在基线评估/第一轮开始前就显示
    yield {
      type: "seed_ready",
      prompt: seed.prompt,
      source: seed.source,
    };

    // 种子基线分
    const seedResults: CaseResult[] = [];
    for (let i = 0; i < dev.length; i++) {
      checkAbort();
      const res = await runWithPrompt(
        executor,
        seed.prompt,
        dev[i].input,
        dev[i].context,
        { temperature: config.executorTemperature, signal },
      );
      ctx.totalTokens += res.tokensIn + res.tokensOut;
      const r = await scoreCase(
        judge,
        dev[i],
        res.content,
        config.scoreThreshold,
        signal,
      );
      seedResults.push({ ...r, index: i });
    }
    const baselineScore = averageScore(seedResults);

    const baselineVersion: PromptVersion = {
      id: uid("pv"),
      datasetId: dataset.id,
      content: seed.prompt,
      version: 0,
      round: 0,
      score: baselineScore,
      changes: ["种子提示词（基线）"],
      status: "baseline",
      createdAt: Date.now(),
    };
    // 基线版本作为外部起点记录，不混入本次成果版本（adoptedVersions）：
    // 它不计入防退化比较，也不影响版本号；新版本的 parentId 指向当前最优（基线或本次成果）。
    ctx.baselineVersion = baselineVersion;
    ctx.bestScore = baselineScore;
    ctx.bestVersionId = baselineVersion.id;

    yield {
      type: "seed",
      prompt: seed.prompt,
      baselineScore,
      source: seed.source,
    };

    // —— 2. 迭代优化 ——
    let noImproveCount = 0;

    for (let roundNum = 1; roundNum <= config.maxRounds; roundNum++) {
      checkAbort();
      const roundStart = Date.now();
      yield { type: "round_start", round: roundNum, totalRounds: config.maxRounds };

      // 2.1 采样训练 minibatch
      const minibatch = sampleN(train, Math.min(config.sampleSize, train.length));
      const sampledIndices = minibatch.map((s) => train.indexOf(s));
      yield { type: "sampled", indices: sampledIndices };

      // 2.2 + 2.3 逐样本测试+评分（generator 顶层，可实时 yield）
      const results: CaseResult[] = [];
      for (let i = 0; i < minibatch.length; i++) {
        checkAbort();
        yield { type: "testing", index: i + 1, total: minibatch.length };
        const res = await runWithPrompt(
          executor,
          ctx.currentPrompt,
          minibatch[i].input,
          minibatch[i].context,
          { temperature: config.executorTemperature, signal },
        );
        ctx.totalTokens += res.tokensIn + res.tokensOut;
        const r = await scoreCase(
          judge,
          minibatch[i],
          res.content,
          config.scoreThreshold,
          signal,
        );
        const cr: CaseResult = { ...r, index: sampledIndices[i] };
        results.push(cr);
        yield { type: "case_done", result: cr };
      }
      const trainAvg = averageScore(results);

      // 2.4 反思
      const failures = results.filter((r) => r.score < config.scoreThreshold);
      const successes = results.filter((r) => r.score >= config.scoreThreshold);
      yield { type: "reflecting" };
      checkAbort();
      const reflectRes = await reflect(
        meta,
        ctx.currentPrompt,
        failures,
        successes,
        signal,
      );
      ctx.totalTokens += reflectRes.tokens;
      yield { type: "reflecting", analysis: summarizeReflect(reflectRes.result) };

      // 2.5 改写
      yield { type: "rewriting" };
      checkAbort();
      const rewriteRes = await rewrite(
        meta,
        ctx.currentPrompt,
        reflectRes.result,
        signal,
      );
      ctx.totalTokens += rewriteRes.tokens;
      yield {
        type: "rewriting",
        newPrompt: rewriteRes.newPrompt,
        changes: rewriteRes.changes,
      };

      // 2.6 验证：新 prompt 在 dev 全量跑
      const devResults: CaseResult[] = [];
      for (let i = 0; i < dev.length; i++) {
        checkAbort();
        const res = await runWithPrompt(
          executor,
          rewriteRes.newPrompt,
          dev[i].input,
          dev[i].context,
          { temperature: config.executorTemperature, signal },
        );
        ctx.totalTokens += res.tokensIn + res.tokensOut;
        const r = await scoreCase(
          judge,
          dev[i],
          res.content,
          config.scoreThreshold,
          signal,
        );
        devResults.push({ ...r, index: i });
      }
      const devScore = averageScore(devResults);

      // 2.7 选优（严格大于当前最优才采纳，防退化）
      const adopted = devScore > ctx.bestScore + 0.001;
      if (adopted) {
        const newVersion: PromptVersion = {
          id: uid("pv"),
          datasetId: dataset.id,
          content: rewriteRes.newPrompt,
          // 成果版本号从 1 开始（基线不计入成果数组）
          version: ctx.adoptedVersions.length + 1,
          round: roundNum,
          score: devScore,
          // 父节点指向当前最优：基线或本次上一个采纳的成果
          parentId: ctx.bestVersionId,
          changes: rewriteRes.changes,
          status: "adopted",
          createdAt: Date.now(),
        };
        ctx.adoptedVersions.push(newVersion);
        ctx.bestScore = devScore;
        ctx.bestVersionId = newVersion.id;
        ctx.currentPrompt = rewriteRes.newPrompt;
        noImproveCount = 0;
      } else {
        noImproveCount++;
      }
      yield { type: "validated", adopted, devScore };
      yield { type: "round_scored", avgScore: trainAvg, devScore };

      const roundRecord: RoundRecord = {
        round: roundNum,
        promptSnapshot: ctx.currentPrompt,
        sampledIndices,
        results,
        avgScore: trainAvg,
        devScore,
        reflectAnalysis: summarizeReflect(reflectRes.result),
        changes: rewriteRes.changes,
        newPrompt: rewriteRes.newPrompt,
        adopted,
        duration: Date.now() - roundStart,
        tokensEstimate: ctx.totalTokens,
      };
      ctx.rounds.push(roundRecord);
      yield { type: "round_end", round: roundNum, roundRecord };

      // —— 3. 停止条件 ——
      if (ctx.bestScore >= config.scoreThreshold) {
        yield { type: "info", message: `已达阈值 ${config.scoreThreshold}` };
        yield finish(ctx, "threshold");
        return;
      }
      if (noImproveCount >= config.convergenceRounds) {
        yield { type: "info", message: `连续 ${noImproveCount} 轮无提升` };
        yield finish(ctx, "converged");
        return;
      }
      if (config.agentAutoStop) {
        checkAbort();
        const dec = await decide(
          meta,
          ctx.rounds.map((r) => ({
            round: r.round,
            devScore: r.devScore,
            changes: r.changes,
          })),
          config.scoreThreshold,
          signal,
        );
        ctx.totalTokens += dec.tokens;
        if (dec.result?.should_stop) {
          yield {
            type: "agent_decision",
            shouldStop: true,
            reason: dec.result.reason,
          };
          yield finish(ctx, "agent");
          return;
        }
        yield {
          type: "agent_decision",
          shouldStop: false,
          reason: dec.result?.reason ?? "继续优化",
        };
      }
    }

    yield finish(ctx, "max_rounds");
  } catch (e) {
    if (
      signal.aborted ||
      (e instanceof DOMException && e.name === "AbortError")
    ) {
      yield { type: "info", message: "已停止" };
      yield finish(ctx, "stopped");
      return;
    }
    yield {
      type: "error",
      message: e instanceof Error ? e.message : String(e),
    };
    yield finish(ctx, "error");
  }
}

function finish(
  ctx: OptimizerContext,
  reason: string,
): Extract<OptimizerEvent, { type: "done" }> {
  return {
    type: "done",
    bestScore: ctx.bestScore,
    bestVersionId: ctx.bestVersionId,
    reason,
    // 基线放最前：它是后续成果版本的 parentId 锚点，必须进库；
    // 去重（按 content）由调用方 persistResults 处理，重复基线不会污染库。
    versions: ctx.baselineVersion
      ? [ctx.baselineVersion, ...ctx.adoptedVersions]
      : [...ctx.adoptedVersions],
    totalTokens: ctx.totalTokens,
    finalPrompt: ctx.currentPrompt,
  };
}
