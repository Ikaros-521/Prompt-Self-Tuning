import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import { useShallow } from "zustand/react/shallow";
import {
  MessageSquare,
  Plus,
  Send,
  Square,
  Copy,
  Check,
  Pencil,
  Trash2,
  Eraser,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, downloadFile } from "@/lib/utils";
import { db } from "@/lib/db";
import { useChatStore } from "@/store/useChatStore";
import type { ChatSession, PromptVersion, TestMessage } from "@/lib/types";

export function TestPanel() {
  const { t } = useTranslation();
  const sessions = useLiveQuery(
    () => db.chatSessions.orderBy("createdAt").reverse().toArray(),
    [],
  );
  const providers = useLiveQuery(() => db.providers.toArray(), []);

  const { currentSessionId, streaming, newSession } = useChatStore(
    useShallow((s) => ({
      currentSessionId: s.currentSessionId,
      streaming: s.streaming,
      newSession: s.newSession,
    })),
  );
  const setCurrentSession = useChatStore((s) => s.setCurrentSession);

  // 自动选中第一个会话（无选中时）
  useEffect(() => {
    if (!currentSessionId && sessions && sessions.length > 0) {
      setCurrentSession(sessions[0].id);
    }
  }, [sessions, currentSessionId, setCurrentSession]);

  // 无供应商时的引导
  if ((providers?.length ?? 0) === 0) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Header />
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <MessageSquare className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {t("test.noProvider")}
          </p>
        </div>
      </div>
    );
  }

  const handleNew = async () => {
    await newSession();
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-120px)] max-w-7xl flex-col gap-3">
      <Header />

      <div className="grid min-h-0 flex-1 grid-cols-[200px_1fr_260px] gap-3">
        {/* 左：会话列表 */}
        <div className="flex min-h-0 flex-col rounded-lg border bg-card">
          <div className="p-2">
            <Button
              size="sm"
              className="w-full"
              onClick={handleNew}
              disabled={streaming}
            >
              <Plus className="h-4 w-4" />
              {t("test.newSession")}
            </Button>
          </div>
          <Separator />
          <div className="flex-1 overflow-auto scrollbar-thin p-1.5">
            {(sessions?.length ?? 0) === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                {t("test.empty")}
              </p>
            ) : (
              <div className="space-y-0.5">
                {sessions?.map((s) => (
                  <SessionItem
                    key={s.id}
                    session={s}
                    active={s.id === currentSessionId}
                    disabled={streaming}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 中：聊天区 */}
        <ChatArea />

        {/* 右：设置 */}
        <SettingsPanel />
      </div>
    </div>
  );
}

function Header() {
  const { t } = useTranslation();
  return (
    <div className="flex shrink-0 items-center justify-between">
      <div>
        <h1 className="text-lg font-semibold">{t("test.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("test.desc")}</p>
      </div>
    </div>
  );
}

/* ============== 左栏：会话列表项 ============== */

function SessionItem({
  session,
  active,
  disabled,
}: {
  session: ChatSession;
  active: boolean;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(session.title);
  const setCurrentSession = useChatStore((s) => s.setCurrentSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const updateSession = useChatStore((s) => s.updateSession);

  const commitRename = async () => {
    setEditing(false);
    if (title.trim() && title !== session.title) {
      await updateSession(session.id, { title: title.trim() });
    } else {
      setTitle(session.title);
    }
  };

  const handleDelete = async () => {
    if (window.confirm(t("test.confirmDelete"))) {
      await deleteSession(session.id);
    }
  };

  return (
    <div
      className={cn(
        "group flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors",
        active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
      )}
      onClick={() => !editing && setCurrentSession(session.id)}
    >
      {editing ? (
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") {
              setTitle(session.title);
              setEditing(false);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 rounded border bg-background px-1 py-0.5 text-xs outline-none"
        />
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate">
            {session.title || t("test.untitled")}
          </span>
          {session.messages.length > 0 && (
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {session.messages.length}
            </span>
          )}
          <div className="flex shrink-0 opacity-0 group-hover:opacity-100">
            <button
              title={t("common.edit")}
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                setTitle(session.title);
                setEditing(true);
              }}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              title={t("common.delete")}
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                void handleDelete();
              }}
              className="rounded p-0.5 text-muted-foreground hover:text-destructive disabled:opacity-40"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ============== 中栏：聊天区 ============== */

function ChatArea() {
  const { t } = useTranslation();
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const streaming = useChatStore((s) => s.streaming);
  const streamingText = useChatStore((s) => s.streamingText);
  const drafts = useChatStore((s) => s.drafts);
  const setDraft = useChatStore((s) => s.setDraft);
  const send = useChatStore((s) => s.send);
  const stop = useChatStore((s) => s.stop);

  const session = useLiveQuery(
    async () =>
      currentSessionId ? await db.chatSessions.get(currentSessionId) : undefined,
    [currentSessionId],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const draft = (currentSessionId && drafts[currentSessionId]) || "";

  // 新消息/流式 → 滚到底
  const msgCount = session?.messages.length ?? 0;
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [msgCount, streamingText]);

  // textarea 自动增高
  const resizeInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };
  useEffect(() => {
    resizeInput();
  }, [draft]);

  const handleSend = async () => {
    if (!draft.trim() || streaming || !session) return;
    if (!session.promptContent.trim()) {
      window.alert(t("test.noPrompt"));
      return;
    }
    await send(draft);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  if (!session) {
    return (
      <div className="flex min-h-0 items-center justify-center rounded-lg border bg-card">
        <div className="flex flex-col items-center gap-2 text-center">
          <MessageSquare className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("test.emptyHint")}</p>
          <Button size="sm" onClick={() => useChatStore.getState().newSession()}>
            <Plus className="h-4 w-4" />
            {t("test.newSession")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col rounded-lg border bg-card">
      {/* 标题条 */}
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {session.title || t("test.untitled")}
        </span>
        {streaming && (
          <Badge variant="secondary" className="animate-pulse text-[10px]">
            {t("test.thinking")}
          </Badge>
        )}
      </div>

      {/* 消息流 */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-auto scrollbar-thin p-3"
      >
        {session.messages.length === 0 && !streaming && (
          <p className="py-12 text-center text-xs text-muted-foreground">
            {t("test.chatEmpty")}
          </p>
        )}
        {session.messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            sessionId={session.id}
            disabled={streaming}
          />
        ))}
        {/* 流式中的草稿气泡 */}
        {streaming && (
          <div className="flex justify-start">
            <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-lg border bg-muted/40 px-3 py-2 text-xs leading-relaxed">
              {streamingText || (
                <span className="text-muted-foreground">{t("test.thinking")}</span>
              )}
              <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-foreground align-middle" />
            </div>
          </div>
        )}
      </div>

      {/* 输入栏 */}
      <div className="shrink-0 border-t p-2">
        <div className="flex items-end gap-2">
          <Textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => {
              setDraft(session.id, e.target.value);
              resizeInput();
            }}
            onKeyDown={handleKeyDown}
            placeholder={t("test.placeholder")}
            disabled={streaming}
            className="min-h-[40px] resize-none text-xs"
          />
          {streaming ? (
            <Button variant="destructive" size="icon" onClick={stop}>
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!draft.trim() || !session.promptContent.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============== 消息气泡（复制/编辑/删除） ============== */

function MessageBubble({
  message,
  sessionId,
  disabled,
}: {
  message: TestMessage;
  sessionId: string;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const editMessage = useChatStore((s) => s.editMessage);
  const deleteMessage = useChatStore((s) => s.deleteMessage);

  const isUser = message.role === "user";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  const saveEdit = async () => {
    setEditing(false);
    if (draft.trim() && draft !== message.content) {
      await editMessage(sessionId, message.id, draft.trim());
    } else {
      setDraft(message.content);
    }
  };

  return (
    <div className={cn("group flex flex-col", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-xs leading-relaxed",
          isUser ? "bg-primary text-primary-foreground" : "border bg-muted/40",
        )}
      >
        {editing ? (
          <div className="space-y-1.5">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-[60px] w-full resize-y rounded border bg-background p-1.5 text-xs outline-none"
            />
            <div className="flex justify-end gap-1">
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => { setDraft(message.content); setEditing(false); }}>
                {t("common.cancel")}
              </Button>
              <Button size="sm" className="h-6 px-2 text-xs" onClick={saveEdit}>
                {t("common.save")}
              </Button>
            </div>
          </div>
        ) : (
          message.content
        )}
      </div>

      {!editing && (
        <div
          className={cn(
            "mt-0.5 flex items-center gap-0.5 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100",
            isUser ? "flex-row-reverse" : "flex-row",
          )}
        >
          <button
            title={t("common.copy")}
            disabled={disabled}
            onClick={copy}
            className="rounded p-1 hover:text-foreground disabled:opacity-40"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </button>
          <button
            title={t("common.edit")}
            disabled={disabled}
            onClick={() => setEditing(true)}
            className="rounded p-1 hover:text-foreground disabled:opacity-40"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            title={t("common.delete")}
            disabled={disabled}
            onClick={() => deleteMessage(sessionId, message.id)}
            className="rounded p-1 hover:text-destructive disabled:opacity-40"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ============== 右栏：设置面板 ============== */

function SettingsPanel() {
  const { t } = useTranslation();
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const streaming = useChatStore((s) => s.streaming);
  const updateSession = useChatStore((s) => s.updateSession);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const deleteSession = useChatStore((s) => s.deleteSession);

  const session = useLiveQuery(
    async () =>
      currentSessionId ? await db.chatSessions.get(currentSessionId) : undefined,
    [currentSessionId],
  );
  const datasets = useLiveQuery(() => db.datasets.toArray(), []);
  const providers = useLiveQuery(() => db.providers.toArray(), []);
  const versions = useLiveQuery(async () => {
    if (!session?.datasetId) return [];
    const all = await db.promptVersions
      .where("datasetId")
      .equals(session.datasetId)
      .toArray();
    return all.sort((a, b) => b.score - a.score);
  }, [session?.datasetId]);

  if (!session) {
    return <div className="rounded-lg border bg-card" />;
  }

  const patch = (p: Partial<ChatSession>) => updateSession(session.id, p);

  /** 选一个库内版本作为 system */
  const bindVersion = (v: PromptVersion) => {
    patch({ promptId: v.id, promptContent: v.content });
  };
  /** 手写 system */
  const setCustomPrompt = (content: string) => {
    patch({ promptId: undefined, promptContent: content });
  };

  const handleClear = async () => {
    if (window.confirm(t("test.confirmClear"))) {
      await clearMessages(session.id);
    }
  };
  const handleDelete = async () => {
    if (window.confirm(t("test.confirmDelete"))) {
      await deleteSession(session.id);
    }
  };

  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-auto scrollbar-thin rounded-lg border bg-card p-3">
      {/* 数据集 → 版本筛选 */}
      <div className="space-y-1.5">
        <Label className="text-xs">{t("test.dataset")}</Label>
        <Select
          value={session.datasetId ?? "__none__"}
          onValueChange={(v) =>
            patch({ datasetId: v === "__none__" ? undefined : v, promptId: undefined, promptContent: "" })
          }
          disabled={streaming}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder={t("common.select")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">{t("common.none")}</SelectItem>
            {datasets?.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name} · {d.samples.length}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 提示词来源切换 */}
      <div className="space-y-1.5">
        <Label className="text-xs">{t("test.promptSource")}</Label>
        <div className="flex gap-1">
          {(["library", "custom"] as const).map((src) => {
            // library 模式 = promptId 是字符串（含空串占位）；custom 模式 = promptId 为 undefined
            const isLibraryMode = session.promptId !== undefined;
            const active = src === "library" ? isLibraryMode : !isLibraryMode;
            return (
              <Button
                key={src}
                size="sm"
                variant={active ? "default" : "outline"}
                className="h-7 flex-1 text-xs"
                disabled={streaming}
                onClick={() => {
                  if (src === "custom") {
                    patch({ promptId: undefined });
                  } else {
                    // 进入库内选择模式（空串占位表示「库模式但未选」）
                    patch({ promptId: "", promptContent: "" });
                  }
                }}
              >
                {t(`test.promptSource${src === "library" ? "Library" : "Custom"}`)}
              </Button>
            );
          })}
        </div>

        {/* 库内版本列表（单选） */}
        {session.promptId !== undefined && (
          <div className="max-h-[160px] space-y-0.5 overflow-auto scrollbar-thin rounded-md border p-1">
            {(versions?.length ?? 0) === 0 ? (
              <span className="block px-2 py-3 text-center text-[11px] text-muted-foreground">
                {t("test.noVersions")}
              </span>
            ) : (
              versions?.map((v) => (
                <button
                  key={v.id}
                  disabled={streaming}
                  onClick={() => bindVersion(v)}
                  className={cn(
                    "flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs disabled:opacity-50",
                    session.promptId === v.id
                      ? "bg-accent"
                      : "hover:bg-accent/50",
                  )}
                >
                  <span className="font-mono">v{v.version}</span>
                  <Badge variant="secondary" className="px-1 text-[10px]">
                    {v.score.toFixed(2)}
                  </Badge>
                  {session.promptId === v.id && (
                    <Check className="ml-auto h-3 w-3 text-primary" />
                  )}
                </button>
              ))
            )}
          </div>
        )}

        {/* 手写 system */}
        {session.promptId === undefined && (
          <Textarea
            value={session.promptContent}
            onChange={(e) => setCustomPrompt(e.target.value)}
            disabled={streaming}
            placeholder={t("test.customPromptPlaceholder")}
            className="min-h-[100px] resize-y font-mono text-xs"
          />
        )}
      </div>

      <Separator />

      {/* Provider */}
      <div className="space-y-1.5">
        <Label className="text-xs">{t("test.provider")}</Label>
        <Select
          value={session.providerId}
          onValueChange={(v) => patch({ providerId: v })}
          disabled={streaming}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {providers?.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} · {p.model}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 上下文轮数 */}
      <SliderField
        label={t("test.contextTurns")}
        value={session.contextTurns ?? 6}
        min={0}
        max={20}
        step={1}
        disabled={streaming}
        onChange={(v) => patch({ contextTurns: v })}
        suffix={String(session.contextTurns ?? 6)}
        tooltip={t("test.contextTurnsHint")}
      />

      {/* 温度 */}
      <SliderField
        label={t("test.temperature")}
        value={session.temperature ?? 0.7}
        min={0}
        max={2}
        step={0.1}
        disabled={streaming}
        onChange={(v) => patch({ temperature: v })}
        suffix={(session.temperature ?? 0.7).toFixed(1)}
      />

      {/* maxTokens */}
      <div className="space-y-1.5">
        <Label className="text-xs">{t("test.maxTokens")}</Label>
        <input
          type="number"
          min={0}
          value={session.maxTokens ?? ""}
          onChange={(e) =>
            patch({
              maxTokens: e.target.value ? Number(e.target.value) : undefined,
            })
          }
          disabled={streaming}
          placeholder={t("test.maxTokensPlaceholder")}
          className="h-8 w-full rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <Separator />

      {/* 危险操作 */}
      <div className="space-y-1.5">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start text-xs"
          disabled={streaming || session.messages.length === 0}
          onClick={handleClear}
        >
          <Eraser className="h-3.5 w-3.5" />
          {t("test.clearMessages")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start text-xs text-destructive hover:text-destructive"
          disabled={streaming}
          onClick={handleDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t("test.deleteSession")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-xs"
          disabled={session.messages.length === 0}
          onClick={() =>
            downloadFile(
              `${(session.title || "chat").replace(/[^\w-]+/g, "_")}.json`,
              JSON.stringify(
                {
                  title: session.title,
                  prompt: session.promptContent,
                  messages: session.messages,
                },
                null,
                2,
              ),
            )
          }
        >
          <Copy className="h-3.5 w-3.5" />
          {t("test.export")}
        </Button>
      </div>
    </div>
  );
}

/* ============== 复用的滑块字段 ============== */

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  disabled,
  suffix,
  tooltip,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  suffix?: string;
  tooltip?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1 text-xs">
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help border-b border-dotted border-muted-foreground">
                {label}
              </span>
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        ) : (
          <span>{label}</span>
        )}
        <span className="ml-auto font-mono tabular-nums text-foreground">
          {suffix}
        </span>
      </Label>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(arr) => onChange(arr[0])}
      />
    </div>
  );
}
