import type { Sample } from "./types";

/**
 * Meta-Prompt 模板集合。
 *
 * 四套模板，对应优化循环的四个阶段：
 * 1. seedPrompt   —— 根据数据集抽样，首次撰写 system prompt
 * 2. judgePrompt  —— LLM-as-judge，给单条输出打分（temperature=0）
 * 3. reflectPrompt—— critic，分析失败模式、归因到具体指令
 * 4. rewritePrompt—— prompt-engineer，产出针对性 delta（保留有效部分）
 */

/** 把若干样本渲染成可读文本 */
export function renderSamples(samples: Sample[], maxLen = 600): string {
  return samples
    .map((s, i) => {
      const parts = [`【样本 ${i + 1}】`];
      if (s.context) {
        parts.push(`上下文：${truncate(s.context, maxLen)}`);
      }
      parts.push(`输入：${truncate(s.input, maxLen)}`);
      parts.push(`期望输出：${truncate(s.expected, maxLen)}`);
      return parts.join("\n");
    })
    .join("\n\n");
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + " …[截断]" : s;
}

/* ---------------- 1. Seed（种子提示词撰写） ---------------- */

export function buildSeedPrompt(samples: Sample[], userGuidance?: string): string {
  const guidanceBlock = userGuidance?.trim()
    ? `\n【用户的需求描述（优先遵循）】\n${userGuidance.trim()}\n\n请在撰写时优先满足用户上述需求，同时结合下面的训练样本。\n`
    : "";
  return `你是一位资深 Prompt Engineer。请根据下面的训练样本，为这个任务撰写一条高质量的 system prompt。

这条 system prompt 之后会被用来指导一个 LLM 处理同类输入、产出符合「期望输出」的结果。
${guidanceBlock}
【训练样本（抽样）】
${renderSamples(samples, 500)}

【撰写要求】
1. 先推断任务类型（问答 / 翻译 / 摘要 / 分类 / 代码 / 结构化抽取 / 改写 等）和输出风格。
2. prompt 要明确：任务目标、输入是什么、输出应该长什么样（格式、语气、长度）。
3. 如果样本有「上下文」字段，请在 prompt 中说明如何利用上下文。
4. 不要在 prompt 里硬编码具体样本的答案，要保持通用性。
5. 简洁、可执行，避免空话。

请只输出 JSON，不要任何额外说明：
{
  "task_type": "<推断的任务类型>",
  "analysis": "<你对任务和样本的简要分析>",
  "system_prompt": "<撰写好的完整 system prompt>"
}`;
}

/* ---------------- 2. Judge（评分 rubric） ---------------- */

export interface JudgeInput {
  input: string;
  context?: string;
  expected: string;
  actual: string;
}

export function buildJudgePrompt(item: JudgeInput): string {
  const ctxLine = item.context
    ? `\n上下文：\n${truncate(item.context, 1000)}\n`
    : "";
  return `你是一个严格、客观的评分员（grader）。请评估「实际输出」相对于「期望输出」的质量。

【输入】
${truncate(item.input, 1000)}
${ctxLine}
【期望输出（参考答案）】
${truncate(item.expected, 1000)}

【实际输出（待评估）】
${truncate(item.actual, 1500)}

【评分维度】请逐项判断：
- correctness（正确性）：核心事实/要点是否与期望输出一致
- completeness（完整性）：是否覆盖了期望输出的要点
- format（格式）：输出格式是否符合期望（如是否结构化、是否有多余内容）
- conciseness（简洁性）：是否有冗余、跑题

【评分规则】
- 给出 0 到 1 的总分（1 = 完美，0.7 = 基本正确有小瑕疵，0.4 = 部分正确，0 = 完全错误）。
- 长度中立：不要因为答案更长就给更高分。
- 列出具体失败维度（failedDimensions），没有则空数组。

请只输出 JSON：
{
  "score": <0-1 的数字, 保留两位小数>,
  "reason": "<简短理由，30字内>",
  "failedDimensions": ["correctness" | "completeness" | "format" | "conciseness"]
}`;
}

/* ---------------- 3. Reflect（critic 反思） ---------------- */

export interface FailureCase {
  input: string;
  context?: string;
  expected: string;
  actual: string;
  score: number;
  reason?: string;
  failedDimensions?: string[];
}

export function buildReflectPrompt(
  currentPrompt: string,
  failures: FailureCase[],
  successes: FailureCase[],
): string {
  const renderCase = (c: FailureCase, i: number) => {
    const parts = [`【案例 ${i + 1}】得分：${c.score}`];
    if (c.context) parts.push(`上下文：${truncate(c.context, 400)}`);
    parts.push(`输入：${truncate(c.input, 400)}`);
    parts.push(`期望输出：${truncate(c.expected, 400)}`);
    parts.push(`实际输出：${truncate(c.actual, 500)}`);
    if (c.reason) parts.push(`评分理由：${c.reason}`);
    if (c.failedDimensions?.length)
      parts.push(`失败维度：${c.failedDimensions.join(", ")}`);
    return parts.join("\n");
  };

  return `你是一位严谨的 Prompt 评审专家（critic）。下面是一条当前在使用的 system prompt，以及它在测试集上的表现。请分析它失败的根本原因，并归因到 prompt 中的具体表述。

【当前 system prompt】
${truncate(currentPrompt, 2000)}

【失败案例】
${failures.length > 0 ? failures.slice(0, 5).map(renderCase).join("\n\n") : "（本轮无明显失败案例，但仍有改进空间）"}

【成功案例（供参照，保持这些有效部分）】
${successes.length > 0 ? successes.slice(0, 2).map((c, i) => renderCase(c, i)).join("\n\n") : "（无）"}

【分析要求】
1. 找出最突出的失败模式（如：格式漂移、漏要点、冗余、未利用上下文、过度发挥等）。
2. 归因到 prompt 的哪句话/哪个缺失导致了失败。
3. 指出哪些部分当前有效，不应在改写时破坏。

请只输出 JSON：
{
  "failure_modes": ["<失败模式1>", "<失败模式2>"],
  "root_causes": ["<根因1，指向具体 prompt 表述>", "<根因2>"],
  "keep": ["<应保留的有效部分>"],
  "suggestions": ["<具体改进建议1>", "<改进建议2>"]
}`;
}

/* ---------------- 4. Rewrite（改写 prompt） ---------------- */

export interface ReflectResult {
  failure_modes?: string[];
  root_causes?: string[];
  keep?: string[];
  suggestions?: string[];
}

export function buildRewritePrompt(
  currentPrompt: string,
  reflect: ReflectResult,
): string {
  return `你是一位资深 Prompt Engineer。请根据下面的反思结论，对当前 system prompt 进行针对性改进，产出新版本。

【当前 system prompt】
${truncate(currentPrompt, 2000)}

【critic 的反思结论】
- 失败模式：${reflect.failure_modes?.join("；") || "无"}
- 根因：${reflect.root_causes?.join("；") || "无"}
- 应保留：${reflect.keep?.join("；") || "无"}
- 改进建议：${reflect.suggestions?.join("；") || "无"}

【改写要求】
1. 只做针对性修改（delta），保留反思中指出「应保留」的有效部分，不要整段推倒重写。
2. 每条改动要可解释、可回滚。
3. 新版本必须是完整的 system prompt（可独立使用），不是 diff。
4. 改动尽量小而精，聚焦解决根因。

请只输出 JSON：
{
  "analysis": "<你对本次改动的简要说明>",
  "changes": ["<改动1>", "<改动2>"],
  "new_prompt": "<改进后的完整 system prompt>"
}`;
}

/* ---------------- 5. Agent 决策（是否继续） ---------------- */

export function buildDecisionPrompt(
  history: { round: number; devScore: number; changes?: string[] }[],
  threshold: number,
): string {
  const histText = history
    .map(
      (h) =>
        `第${h.round}轮：验证分 ${h.devScore}${h.changes?.length ? `（${h.changes.join("；")}）` : ""}`,
    )
    .join("\n");

  return `你是优化过程的决策者。请根据历史轮次的验证分变化，判断是否应该继续优化。

【历史记录】
${histText || "（刚开始）"}

【达标阈值】${threshold}

【判断依据】
- 如果最近验证分已达到或超过阈值，应停止。
- 如果连续多轮没有提升，继续优化收益低，应停止。
- 如果分数仍在稳步上升且未达阈值，可继续。

请只输出 JSON：
{
  "should_stop": <true/false>,
  "reason": "<简短理由>",
  "confidence": <0-1>
}`;
}

/** Agent 决策结果（非 JSON 时退化为简单规则） */
export interface DecisionResult {
  should_stop: boolean;
  reason: string;
  confidence: number;
}

/* ---------------- 6. Seed Chat（引导式初版生成） ---------------- */

/**
 * 引导 agent 的 system prompt。
 * 角色设定：通过一次一个问题，帮助用户明确任务，最终产出一条 system prompt。
 */
export function buildSeedChatSystem(): string {
  return `你是一位资深的 Prompt 工程顾问，正在协助用户为其 LLM 任务设计一条高质量的 system prompt。

你的工作方式：
1. 通过对话，一次只问一个最关键的问题，逐步明确：任务类型、输入是什么、期望输出的格式/语气/长度、是否有上下文、有无特殊约束。
2. 根据用户的回答，判断还缺哪些关键信息，继续追问。
3. 当你认为信息已经足够（通常 2-5 轮），就产出一条完整的 system prompt 草稿。
4. 草稿要具体、可执行，不要硬编码具体样本答案，保持通用性。
5. 你的每次回复都必须是严格的 JSON。

输出格式（每次都遵守）：
{
  "reply": "<对用户说的话，自然语言，包含你的下一个问题或对草稿的说明>",
  "draft_prompt": "<当你准备好时，填入完整的 system prompt 草稿；否则为 null>",
  "ready": <true 表示你已产出 draft_prompt，可以交由用户确认；false 表示还在追问阶段>
}

注意：reply 字段始终要有内容（即使 ready=true，也要简短说明这个草稿的思路）。`;
}

/**
 * 每轮对话的用户消息：把对话历史 + 数据集抽样喂给 agent。
 * 仅在首轮和用户每次发言后调用，附带样本供 agent 参考。
 */
export function buildSeedChatUser(
  history: { role: "user" | "assistant"; content: string }[],
  samples: Sample[],
  round: number,
  maxRounds: number,
): string {
  const isFirst = history.filter((h) => h.role === "user").length === 0;
  const samplesBlock = isFirst
    ? `\n【参考：训练数据集抽样（用于理解任务，不要硬编码答案）】\n${renderSamples(samples, 400)}\n`
    : "";

  const forceDraft = round >= maxRounds;

  return `${samplesBlock}${
    isFirst
      ? "你好，我想为我的任务设计一条 system prompt。请通过提问帮我明确需求。"
      : "(请基于以上对话继续，回复 JSON)"
  }${
    forceDraft
      ? "\n\n⚠ 注意：已达对话轮数上限，请务必在本轮产出 draft_prompt 并设 ready=true。"
      : ""
  }`;
}

/** seed chat 一轮的结构化返回 */
export interface SeedChatTurn {
  reply: string;
  draft_prompt: string | null;
  ready: boolean;
}

