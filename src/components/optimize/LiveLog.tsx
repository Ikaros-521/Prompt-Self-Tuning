import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { LogLine } from "@/store/useRunStore";
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

export function LiveLog({ logs }: Props) {
  const { t } = useTranslation();
  const endRef = useRef<HTMLDivElement>(null);

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
    <div className="h-full overflow-auto scrollbar-thin p-3 font-mono text-xs leading-relaxed">
      {logs.map((l) => (
        <div key={l.id} className="flex gap-2">
          <span className="shrink-0 select-none text-muted-foreground/60">
            {new Date(l.ts).toLocaleTimeString(undefined, {
              hour12: false,
            })}
          </span>
          <span className={cn("whitespace-pre-wrap break-words", levelColor[l.level])}>
            {l.text}
          </span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
