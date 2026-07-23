import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { LogDetail, LogLine } from "@/store/useRunStore";
import { useTranslation } from "react-i18next";

interface Props {
  logs: LogLine[];
}

const levelColor: Record<LogLine["level"], string> = {
  info: "text-foreground",
  success: "text-success",
  warn: "text-warning",
  error: "text-destructive",
};

/** 一条携带实测详情的可展开日志行 */
function DetailLogRow({ log, defaultOpen }: { log: LogLine; defaultOpen: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  const d = log.detail as LogDetail;

  const statusColor =
    d.status === "pass"
      ? "text-success"
      : d.status === "fail"
        ? "text-destructive"
        : "text-warning";

  return (
    <div className="flex flex-col">
      <div className="flex gap-2">
        <span className="shrink-0 select-none text-muted-foreground/60">
          {new Date(log.ts).toLocaleTimeString(undefined, { hour12: false })}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-start gap-1 text-left"
          title={t("log.expandHint")}
        >
          <span className={cn("shrink-0 select-none", statusColor)}>
            {open ? "▾" : "▸"}
          </span>
          <span
            className={cn(
              "whitespace-pre-wrap break-words underline-offset-2 hover:underline",
              levelColor[log.level],
            )}
          >
            {log.text}
          </span>
        </button>
      </div>

      {open && (
        <div className="mt-1 mb-1.5 ml-16 grid gap-1 rounded-md border border-border/60 bg-muted/40 p-2 text-[11px] leading-relaxed">
          {d.context && (
            <Field
              label={t("log.detail.context")}
              value={d.context}
              copyable
            />
          )}
          <Field label={t("log.detail.input")} value={d.input} copyable />
          <Field
            label={t("log.detail.expected")}
            value={d.expected}
            copyable
          />
          <Field label={t("log.detail.actual")} value={d.actual} copyable />
          {d.reason && (
            <Field label={t("log.detail.reason")} value={d.reason} />
          )}
          {d.failedDimensions && d.failedDimensions.length > 0 && (
            <div className="flex gap-1.5">
              <span className="shrink-0 select-none text-muted-foreground">
                {t("log.detail.failedDims")}:
              </span>
              <div className="flex flex-wrap gap-1">
                {d.failedDimensions.map((dim) => (
                  <span
                    key={dim}
                    className="rounded bg-destructive/10 px-1.5 text-destructive"
                  >
                    {dim}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 详情块里的一个键值字段，长文本可展开/复制 */
function Field({
  label,
  value,
  copyable,
}: {
  label: string;
  value?: string;
  copyable?: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!value) return null;

  const long = value.length > 80 || value.includes("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* 忽略剪贴板失败 */
    }
  };

  return (
    <div className="flex gap-1.5">
      <span className="shrink-0 select-none text-muted-foreground">
        {label}:
      </span>
      <div className="min-w-0 flex-1">
        <pre
          className={cn(
            "whitespace-pre-wrap break-words font-mono",
            expanded ? "" : "line-clamp-2",
          )}
        >
          {value}
        </pre>
        <div className="mt-0.5 flex items-center gap-2">
          {long && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-[10px] text-primary hover:underline"
            >
              {expanded ? t("log.detail.collapse") : t("log.detail.expand")}
            </button>
          )}
          {copyable && (
            <button
              type="button"
              onClick={copy}
              className="text-[10px] text-muted-foreground hover:underline"
            >
              {copied ? t("log.detail.copied") : t("log.detail.copy")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function LiveLog({ logs }: Props) {
  const { t } = useTranslation();
  const endRef = useRef<HTMLDivElement>(null);
  const [expandAll, setExpandAll] = useState(false);

  const hasDetail = logs.some((l) => l.detail);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [logs.length]);

  if (logs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("optimize.log.empty")}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {hasDetail && (
        <div className="flex shrink-0 items-center justify-end border-b border-border/40 px-3 py-1 text-[11px] text-muted-foreground">
          <button
            type="button"
            onClick={() => setExpandAll((v) => !v)}
            className="hover:text-foreground hover:underline"
          >
            {expandAll ? t("log.collapseAll") : t("log.expandAll")}
          </button>
        </div>
      )}
      <div className="flex-1 overflow-auto scrollbar-thin p-3 font-mono text-xs leading-relaxed">
        {logs.map((l) =>
          l.detail ? (
            // expandAll 变化时用 key 重建，让 defaultOpen 生效
            <DetailLogRow
              key={`${l.id}-${expandAll}`}
              log={l}
              defaultOpen={expandAll}
            />
          ) : (
            <div key={l.id} className="flex gap-2">
              <span className="shrink-0 select-none text-muted-foreground/60">
                {new Date(l.ts).toLocaleTimeString(undefined, {
                  hour12: false,
                })}
              </span>
              <span
                className={cn(
                  "whitespace-pre-wrap break-words",
                  levelColor[l.level],
                )}
              >
                {l.text}
              </span>
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
