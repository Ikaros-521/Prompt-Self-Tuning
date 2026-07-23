import { useTranslation } from "react-i18next";
import { TrendingUp, Trophy, Repeat, Coins } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  current: number;
  best: number;
  round: number;
  totalRounds: number;
  tokens: number;
}

export function MetricCards({ current, best, round, totalRounds, tokens }: Props) {
  const { t } = useTranslation();

  const items = [
    {
      label: t("optimize.metrics.currentScore"),
      value: current.toFixed(3),
      icon: TrendingUp,
      color: "text-primary",
    },
    {
      label: t("optimize.metrics.bestScore"),
      value: best.toFixed(3),
      icon: Trophy,
      color: "text-success",
    },
    {
      label: t("optimize.metrics.round"),
      value: totalRounds > 0 ? `${round}/${totalRounds}` : `${round}`,
      icon: Repeat,
      color: "text-muted-foreground",
    },
    {
      label: t("optimize.metrics.tokens"),
      value: formatTokens(tokens),
      icon: Coins,
      color: "text-muted-foreground",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-md border bg-card p-2.5"
        >
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <it.icon className={cn("h-3 w-3", it.color)} />
            {it.label}
          </div>
          <div className="mt-1 font-mono text-lg font-semibold tabular-nums">
            {it.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}
