import { create } from "zustand";
import { db, getDefaultProvider } from "@/lib/db";
import { streamChat } from "@/lib/llm";
import { uid } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import type { ChatMessage, ChatSession, TestMessage } from "@/lib/types";

/**
 * 测试页全局 store。
 *
 * 为什么放全局而非组件 state：
 *  - 流式回复需要一个模块级 AbortController，切 tab 卸载组件后回复仍要写库；
 *  - 每个会话的输入草稿、流式中的草稿文本要在切 tab 后恢复。
 * 仿 useRunStore 的模块级 controller 模式。
 */

interface ChatStore {
  /** 当前选中的会话 id */
  currentSessionId: string | null;
  /** 是否正在流式回复 */
  streaming: boolean;
  /** 流式中的实时文本（完成即写库并清空） */
  streamingText: string;
  /** 每个会话的输入草稿（key = sessionId） */
  drafts: Record<string, string>;

  setCurrentSession: (id: string | null) => void;
  setDraft: (sessionId: string, text: string) => void;

  /** 新建空会话，返回其 id（默认绑定默认 provider） */
  newSession: (datasetId?: string) => Promise<string>;
  /** 更新会话字段（标题/设置/绑定 prompt 等），落库 */
  updateSession: (id: string, patch: Partial<ChatSession>) => Promise<void>;
  /** 删除会话 */
  deleteSession: (id: string) => Promise<void>;
  /** 清空会话消息（保留会话本身与设置） */
  clearMessages: (id: string) => Promise<void>;
  /** 编辑单条消息文本（落库，不重算） */
  editMessage: (
    sessionId: string,
    msgId: string,
    content: string,
  ) => Promise<void>;
  /** 删除单条消息（落库） */
  deleteMessage: (sessionId: string, msgId: string) => Promise<void>;

  /** 发送一条 user 消息并触发流式回复 */
  send: (text: string) => Promise<void>;
  /** 停止当前流式 */
  stop: () => void;
}

// 模块级 AbortController：跨组件生命周期，stop() 可从任意组件调用
let abortController: AbortController | null = null;

export const useChatStore = create<ChatStore>((set, get) => ({
  currentSessionId: null,
  streaming: false,
  streamingText: "",
  drafts: {},

  setCurrentSession: (currentSessionId) => set({ currentSessionId }),
  setDraft: (sessionId, text) =>
    set((s) => ({ drafts: { ...s.drafts, [sessionId]: text } })),

  newSession: async (datasetId) => {
    const provider = await getDefaultProvider();
    const now = Date.now();
    const session: ChatSession = {
      id: uid("chat"),
      title: "", // 空 → 由首条消息自动命名
      promptId: undefined,
      datasetId,
      promptContent: "",
      messages: [],
      providerId: provider?.id ?? "",
      temperature: 0.7,
      maxTokens: undefined,
      contextTurns: 6,
      createdAt: now,
      updatedAt: now,
    };
    await db.chatSessions.put(session);
    set({ currentSessionId: session.id });
    return session.id;
  },

  updateSession: async (id, patch) => {
    await db.chatSessions.update(id, { ...patch, updatedAt: Date.now() });
  },

  deleteSession: async (id) => {
    await db.chatSessions.delete(id);
    const { currentSessionId } = get();
    if (currentSessionId === id) set({ currentSessionId: null });
  },

  clearMessages: async (id) => {
    await db.chatSessions.update(id, {
      messages: [],
      title: "",
      updatedAt: Date.now(),
    });
  },

  editMessage: async (sessionId, msgId, content) => {
    const session = await db.chatSessions.get(sessionId);
    if (!session) return;
    const messages = session.messages.map((m) =>
      m.id === msgId ? { ...m, content } : m,
    );
    await db.chatSessions.update(sessionId, {
      messages,
      updatedAt: Date.now(),
    });
  },

  deleteMessage: async (sessionId, msgId) => {
    const session = await db.chatSessions.get(sessionId);
    if (!session) return;
    const messages = session.messages.filter((m) => m.id !== msgId);
    await db.chatSessions.update(sessionId, {
      messages,
      updatedAt: Date.now(),
    });
  },

  send: async (text) => {
    const trimmed = text.trim();
    if (!trimmed || get().streaming) return;

    const sessionId = get().currentSessionId;
    if (!sessionId) return;
    const session = await db.chatSessions.get(sessionId);
    if (!session) return;
    const provider = await db.providers.get(session.providerId);
    if (!provider) {
      toast.error("未找到供应商，请在设置中先配置一个");
      return;
    }

    // 1. 追加 user 消息（落库）
    const userMsg: TestMessage = {
      id: uid("msg"),
      role: "user",
      content: trimmed,
      ts: Date.now(),
    };
    const baseMessages = [...session.messages, userMsg];
    // 首条消息 → 自动命名
    const title =
      session.title || trimmed.slice(0, 24) + (trimmed.length > 24 ? "…" : "");
    await db.chatSessions.update(sessionId, {
      messages: baseMessages,
      title,
      updatedAt: Date.now(),
    });
    // 清空草稿
    set((s) => ({ drafts: { ...s.drafts, [sessionId]: "" } }));

    // 2. 拼 LLM messages：system + 最近 contextTurns 轮历史
    const turns = session.contextTurns ?? 0;
    const history = turns > 0 ? baseMessages.slice(-turns * 2) : [];
    const llmMessages: ChatMessage[] = [];
    if (session.promptContent.trim()) {
      llmMessages.push({ role: "system", content: session.promptContent });
    }
    for (const m of history) {
      llmMessages.push({ role: m.role, content: m.content });
    }

    // 3. 流式
    const controller = new AbortController();
    abortController = controller;
    set({ streaming: true, streamingText: "" });

    try {
      const result = await streamChat(
        {
          provider,
          messages: llmMessages,
          temperature: session.temperature,
          maxTokens: session.maxTokens,
          signal: controller.signal,
        },
        (_delta, full) => set({ streamingText: full }),
      );

      // 4. 完成：写 assistant 消息
      const assistantMsg: TestMessage = {
        id: uid("msg"),
        role: "assistant",
        content: result.content,
        ts: Date.now(),
      };
      const latest = await db.chatSessions.get(sessionId);
      if (latest) {
        await db.chatSessions.update(sessionId, {
          messages: [...latest.messages, assistantMsg],
          updatedAt: Date.now(),
        });
      }
    } catch (e) {
      // abort 中断：把已流式到的部分作为 assistant 消息落库（若有内容）
      const partial = get().streamingText;
      if (controller.signal.aborted && partial.trim()) {
        const latest = await db.chatSessions.get(sessionId);
        if (latest) {
          await db.chatSessions.update(sessionId, {
            messages: [
              ...latest.messages,
              {
                id: uid("msg"),
                role: "assistant" as const,
                content: partial,
                ts: Date.now(),
              },
            ],
            updatedAt: Date.now(),
          });
        }
      } else if (!controller.signal.aborted) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    } finally {
      abortController = null;
      set({ streaming: false, streamingText: "" });
    }
  },

  stop: () => {
    abortController?.abort();
  },
}));
