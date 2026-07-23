import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Send, Loader2, Check, RotateCcw, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import {
  createSeedChatSession,
  runSeedChatTurn,
  MAX_SEED_CHAT_ROUNDS,
  type SeedChatSession,
} from "@/lib/seedChat";
import type { Provider, Sample } from "@/lib/types";

interface ChatBubble {
  id: string;
  role: "user" | "assistant";
  text: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: Provider;
  samples: Sample[];
  /** 用户确认初版后的回调 */
  onConfirm: (prompt: string) => void;
}

export function SeedChatDialog({
  open,
  onOpenChange,
  provider,
  samples,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  const [session, setSession] = useState<SeedChatSession | null>(null);
  const [bubbles, setBubbles] = useState<ChatBubble[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const idCounter = useRef(0);

  const nextId = () => `b${++idCounter.current}`;

  // 打开时初始化会话并自动发首轮（让 agent 开场提问）
  useEffect(() => {
    if (!open) return;
    const s = createSeedChatSession(provider, samples);
    setSession(s);
    setBubbles([]);
    setDraft(null);
    setError(null);
    setInput("");
    // 自动发起首轮对话
    void kickoff(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 新消息时滚动到底
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [bubbles, loading]);

  const kickoff = useCallback(async (s: SeedChatSession) => {
    setLoading(true);
    setError(null);
    try {
      const { turn } = await runSeedChatTurn(s, "");
      setBubbles((bs) => [...bs, { id: nextId(), role: "assistant", text: turn.reply }]);
      if (turn.draft_prompt) setDraft(turn.draft_prompt);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSend = useCallback(async () => {
    if (!session || loading || (!input.trim() && !draft)) return;

    // 若已有 draft 且用户没输入新内容，draft 确认由专门按钮处理
    if (input.trim()) {
      const userText = input.trim();
      setBubbles((bs) => [...bs, { id: nextId(), role: "user", text: userText }]);
      setInput("");
      setLoading(true);
      setError(null);
      try {
        const { turn } = await runSeedChatTurn(session, userText);
        setBubbles((bs) => [
          ...bs,
          { id: nextId(), role: "assistant", text: turn.reply },
        ]);
        if (turn.draft_prompt) setDraft(turn.draft_prompt);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
  }, [session, input, loading, draft]);

  const handleConfirm = useCallback(() => {
    if (!draft) return;
    onConfirm(draft);
    onOpenChange(false);
  }, [draft, onConfirm, onOpenChange]);

  const handleRestart = useCallback(() => {
    if (!session) return;
    const s = createSeedChatSession(provider, samples);
    setSession(s);
    setBubbles([]);
    setDraft(null);
    setError(null);
    void kickoff(s);
  }, [provider, samples, kickoff]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const round = session?.round ?? 0;
  const atLimit = round >= MAX_SEED_CHAT_ROUNDS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {t("optimize.seedChat.title")}
            <Badge variant="muted">
              {round}/{MAX_SEED_CHAT_ROUNDS}
            </Badge>
          </DialogTitle>
          <DialogDescription>{t("optimize.seedChat.desc")}</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-[1fr_280px] gap-3">
          {/* 左：对话区 */}
          <div className="flex min-h-0 flex-col gap-2">
            <div
              ref={scrollRef}
              className="flex-1 space-y-2 overflow-auto scrollbar-thin rounded-md border bg-muted/20 p-3"
            >
              {bubbles.length === 0 && !loading && (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  {t("optimize.seedChat.empty")}
                </p>
              )}
              {bubbles.map((b) => (
                <div
                  key={b.id}
                  className={cn(
                    "flex",
                    b.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-xs leading-relaxed",
                      b.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-card border",
                    )}
                  >
                    {b.text}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {t("optimize.seedChat.thinking")}
                  </div>
                </div>
              )}
            </div>

            {/* draft 确认条 */}
            {draft && (
              <Alert variant="success" className="py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium">
                      {t("optimize.seedChat.draftReady")}
                    </p>
                    <pre className="mt-1 max-h-24 overflow-auto scrollbar-thin whitespace-pre-wrap break-words rounded bg-success/10 p-2 font-mono text-[11px]">
                      {draft}
                    </pre>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button size="sm" onClick={handleConfirm}>
                      <Check className="h-3.5 w-3.5" />
                      {t("optimize.seedChat.useDraft")}
                    </Button>
                  </div>
                </div>
              </Alert>
            )}

            {error && (
              <Alert variant="destructive" className="py-2">
                <AlertDescription className="text-xs">
                  {t("optimize.seedChat.error", { error })}
                </AlertDescription>
              </Alert>
            )}

            {atLimit && !draft && (
              <Alert variant="warning" className="py-2">
                <AlertDescription className="text-xs">
                  {t("optimize.seedChat.roundLimit")}
                </AlertDescription>
              </Alert>
            )}

            {/* 输入区 */}
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                placeholder={t("optimize.seedChat.placeholder")}
                className="min-h-[44px] resize-none text-xs"
              />
              <Button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* 右：数据集抽样预览（只读参考） */}
          <div className="flex min-h-0 flex-col rounded-md border">
            <div className="border-b bg-muted/40 px-2 py-1.5 text-xs font-medium text-muted-foreground">
              {t("optimize.seedChat.samplesTitle")} · {samples.length}
            </div>
            <div className="flex-1 space-y-2 overflow-auto scrollbar-thin p-2">
              {samples.slice(0, 6).map((s, i) => (
                <div key={i} className="rounded border bg-card p-2 text-[11px]">
                  <div className="font-medium text-muted-foreground">
                    #{i + 1}
                  </div>
                  <div className="mt-1">
                    <span className="text-muted-foreground">in:</span>{" "}
                    <span className="line-clamp-2 whitespace-pre-wrap break-words">
                      {s.input}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">out:</span>{" "}
                    <span className="line-clamp-2 whitespace-pre-wrap break-words">
                      {s.expected}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t p-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleRestart}
                disabled={loading}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t("optimize.seedChat.restart")}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
