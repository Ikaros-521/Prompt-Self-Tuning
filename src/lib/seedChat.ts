import type { ChatMessage, Provider, Sample } from "./types";
import { chat } from "./llm";
import {
  buildSeedChatSystem,
  buildSeedChatUser,
  type SeedChatTurn,
} from "./metaPrompts";
import { extractJson } from "./utils";

/**
 * 引导式初版提示词生成：与 seed agent 多轮对话，逐步明确需求后产出草稿。
 *
 * 设计：
 * - 维护一份完整的 messages 历史（system + 历轮 user/assistant）。
 * - 每轮：把「用户的新发言」+「数据集抽样（仅首轮）」组装成一条 user 消息追加。
 *   注意：这里把 agent 的结构化 JSON 回复原样作为 assistant 消息存回历史，
 *   让 agent 能看到自己上轮说了什么。
 * - agent 返回 JSON：{ reply, draft_prompt, ready }。
 * - 解析失败时降级：把原文当 reply，ready=false，让对话能继续。
 */

export interface SeedChatSession {
  provider: Provider;
  samples: Sample[];
  messages: ChatMessage[];
  /** 已进行的用户发言轮数 */
  round: number;
}

/** 最大对话轮数（防止无限追问） */
export const MAX_SEED_CHAT_ROUNDS = 8;

/** 创建一个新会话（含 system prompt） */
export function createSeedChatSession(
  provider: Provider,
  samples: Sample[],
): SeedChatSession {
  return {
    provider,
    samples,
    messages: [{ role: "system", content: buildSeedChatSystem() }],
    round: 0,
  };
}

/**
 * 发送一轮对话。
 * @param userInput 本轮用户发言（首轮可为空字符串，会自动用引导开场白）
 * @returns agent 的结构化回复 + token 消耗
 */
export async function runSeedChatTurn(
  session: SeedChatSession,
  userInput: string,
  signal?: AbortSignal,
): Promise<{ turn: SeedChatTurn; tokens: number }> {
  session.round += 1;

  // 组装本轮 user 消息
  const userMsg = buildSeedChatUser(
    session.messages.filter(
      (m): m is Extract<ChatMessage, { role: "user" | "assistant" }> =>
        m.role === "user" || m.role === "assistant",
    ),
    session.samples,
    session.round,
    MAX_SEED_CHAT_ROUNDS,
  );

  // 把用户的原始发言也加进历史（若有），便于 agent 理解上下文
  if (userInput.trim()) {
    session.messages.push({ role: "user", content: userInput.trim() });
  }
  // 追加本轮「组装消息」（含样本/轮数提示）—— 用 user 角色
  session.messages.push({ role: "user", content: userMsg });

  const res = await chat({
    provider: session.provider,
    temperature: 0.7,
    signal,
    messages: session.messages,
  });

  const parsed = extractJson<SeedChatTurn>(res.content);

  // 把 agent 的原始回复存回历史（原样，保证对话连贯）
  session.messages.push({ role: "assistant", content: res.content });

  const turn: SeedChatTurn = parsed
    ? {
        reply: typeof parsed.reply === "string" ? parsed.reply : res.content,
        draft_prompt:
          typeof parsed.draft_prompt === "string" ? parsed.draft_prompt : null,
        ready: parsed.ready === true,
      }
    : {
        // 解析失败降级：把原文当回复，继续对话
        reply: res.content,
        draft_prompt: null,
        ready: false,
      };

  // 兜底：若达到轮数上限 agent 仍没给 draft，从回复里尽力抽取
  if (!turn.draft_prompt && session.round >= MAX_SEED_CHAT_ROUNDS) {
    turn.draft_prompt = extractPromptFromText(res.content);
    if (turn.draft_prompt) turn.ready = true;
  }

  return { turn, tokens: res.tokensIn + res.tokensOut };
}

/** 从非结构化文本里尽力抽取一段像 system prompt 的内容（兜底） */
function extractPromptFromText(text: string): string | null {
  // 尝试代码块
  const fence = text.match(/```(?:\w+)?\s*([\s\S]*?)```/);
  if (fence && fence[1].trim().length > 20) return fence[1].trim();
  return null;
}
