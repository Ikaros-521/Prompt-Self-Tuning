import type { ChatParams, Provider } from "./types";

/** 规范化 base_url：去除尾部斜杠，确保有 /v1 这类前缀不强求 */
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

/** 拼出 chat completions 端点 */
export function chatEndpoint(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl);
  if (/\/v\d+$/.test(base)) return `${base}/chat/completions`;
  // 若未带 /v1，自动补一个（多数 OpenAI 兼容网关遵循此约定）
  return `${base}/v1/chat/completions`;
}

export interface ChatResult {
  content: string;
  /** 估算 token（粗略：4 字符 ≈ 1 token） */
  tokensIn: number;
  tokensOut: number;
  finishReason?: string;
}

/** 粗略 token 估算（无 tokenizer 依赖时的兜底） */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // 中文字符按 1.5 token，英文按 4 字符 1 token 的折中
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const other = text.length - cjk;
  return Math.ceil(cjk * 1.5 + other / 4);
}

function buildHeaders(provider: Provider): HeadersInit {
  const h: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (provider.apiKey) {
    h["Authorization"] = `Bearer ${provider.apiKey}`;
  }
  return h;
}

function buildBody(p: ChatParams): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: p.provider.model,
    messages: p.messages.map((m) => ({ role: m.role, content: m.content })),
    temperature: p.temperature ?? p.provider.temperature ?? 0.7,
    stream: false,
  };
  const maxTokens = p.maxTokens ?? p.provider.maxTokens;
  if (maxTokens) body.max_tokens = maxTokens;
  return body;
}

/** 把 HTTP 错误转成可读信息 */
async function readError(res: Response): Promise<string> {
  let detail = "";
  try {
    const data = await res.json();
    detail =
      data?.error?.message ||
      data?.message ||
      data?.error ||
      JSON.stringify(data);
  } catch {
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
  }
  if (res.status === 0 || res.type === "opaque") {
    return `网络/CORS 错误：浏览器无法访问该端点（状态 ${res.status}）。请确认 base_url 支持 CORS。`;
  }
  return `HTTP ${res.status} ${res.statusText}${detail ? `: ${detail.slice(0, 300)}` : ""}`;
}

/**
 * 非流式聊天补全。
 * 用于评分（judge）、反思、改写等需要完整 JSON 的场景。
 */
export async function chat(p: ChatParams): Promise<ChatResult> {
  const url = chatEndpoint(p.provider.baseUrl);
  const tokensIn = estimateTokens(
    p.messages.map((m) => m.content).join("\n"),
  );

  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(p.provider),
    body: JSON.stringify(buildBody(p)),
    signal: p.signal,
  });

  if (!res.ok) {
    throw new Error(await readError(res));
  }

  const data = await res.json();
  const content: string =
    data?.choices?.[0]?.message?.content ??
    data?.choices?.[0]?.text ??
    "";
  const finishReason = data?.choices?.[0]?.finish_reason;

  return {
    content: typeof content === "string" ? content : String(content ?? ""),
    tokensIn,
    tokensOut: estimateTokens(content),
    finishReason,
  };
}

/**
 * 流式聊天补全（fetch + ReadableStream 手动解析 SSE）。
 * 用于优化过程的执行器输出展示。
 *
 * @param onDelta 每个 token 片段回调
 */
export async function streamChat(
  p: ChatParams,
  onDelta: (delta: string, full: string) => void,
): Promise<ChatResult> {
  const url = chatEndpoint(p.provider.baseUrl);
  const body = buildBody(p);
  body.stream = true;

  const tokensIn = estimateTokens(
    p.messages.map((m) => m.content).join("\n"),
  );

  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(p.provider),
    body: JSON.stringify(body),
    signal: p.signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(await readError(res));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let finishReason: string | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    // stream:true 处理 UTF-8 多字节边界
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    // 保留最后可能不完整的一行
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload);
        const delta: string =
          json?.choices?.[0]?.delta?.content ??
          json?.choices?.[0]?.text ??
          "";
        if (delta) {
          full += delta;
          onDelta(delta, full);
        }
        if (json?.choices?.[0]?.finish_reason) {
          finishReason = json.choices[0].finish_reason;
        }
      } catch {
        /* 跳过无法解析的片段 */
      }
    }
  }

  return {
    content: full,
    tokensIn,
    tokensOut: estimateTokens(full),
    finishReason,
  };
}

/**
 * 便捷封装：以给定 system prompt 对 user input 调用，返回完整内容。
 * 用于执行器：把 system prompt + 样本 input（+context）发给 LLM。
 */
export async function runWithPrompt(
  provider: Provider,
  systemPrompt: string,
  input: string,
  context?: string,
  opts?: { temperature?: number; signal?: AbortSignal },
): Promise<ChatResult> {
  const userContent = context
    ? `[Context]\n${context}\n\n[Input]\n${input}`
    : input;
  return chat({
    provider,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    temperature: opts?.temperature ?? provider.temperature ?? 0.7,
    signal: opts?.signal,
  });
}

/** 获取供应商可用模型列表（best-effort，部分网关不支持则返回空） */
export async function listModels(provider: Provider): Promise<string[]> {
  const base = normalizeBaseUrl(provider.baseUrl);
  const url = /\/v\d+$/.test(base) ? `${base}/models` : `${base}/v1/models`;
  try {
    const res = await fetch(url, { headers: buildHeaders(provider) });
    if (!res.ok) return [];
    const data = await res.json();
    const list = data?.data ?? data?.models ?? [];
    return list
      .map((m: { id?: string; name?: string }) => m.id ?? m.name)
      .filter((x: unknown): x is string => typeof x === "string");
  } catch {
    return [];
  }
}
