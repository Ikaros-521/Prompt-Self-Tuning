import { useTranslation } from "react-i18next";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartPoint } from "@/hooks/useOptimizer";

interface Props {
  data: ChartPoint[];
}

export function ScoreChart({ data }: Props) {
  const { t } = useTranslation();

  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        {t("optimize.chart.title")}
      </div>
    );
  }

  return (
    <div className="h-full w-full p-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="round"
            tick={{ fontSize: 11 }}
            label={{
              value: t("optimize.chart.round"),
              position: "insideBottom",
              offset: -2,
              fontSize: 10,
            }}
            domain={[1, "auto"]}
            allowDecimals={false}
          />
          <YAxis
            domain={[0, 1]}
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => v.toFixed(1)}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 6,
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
            }}
            formatter={(v: number) => v.toFixed(3)}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line
            type="monotone"
            dataKey="train"
            name={t("optimize.chart.trainScore")}
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="dev"
            name={t("optimize.chart.devScore")}
            stroke="hsl(var(--success))"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
