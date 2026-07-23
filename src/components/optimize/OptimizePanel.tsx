import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import { useShallow } from "zustand/react/shallow";
import { Play, Square, RotateCcw, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { db, getDefaultProvider } from "@/lib/db";
import { useRunStore } from "@/store/useRunStore";
import { useAppStore } from "@/store/useAppStore";
import type { Dataset, OptimizeConfig, Provider } from "@/lib/types";
import { ConfigForm } from "./ConfigForm";
import { LiveLog } from "./LiveLog";
import { ScoreChart } from "./ScoreChart";
import { MetricCards } from "./MetricCards";
import { PromptPreview } from "./PromptPreview";
import { SeedChatDialog } from "./SeedChatDialog";

const DEFAULT_CONFIG: OptimizeConfig = {
  datasetId: "",
  providerId: "",
  judgeProviderId: undefined,
  maxRounds: 8,
  sampleSize: 8,
  executorTemperature: 0.7,
  scoreThreshold: 0.9,
  convergenceRounds: 3,
  trainRatio: 0.8,
  agentAutoStop: true,
  concurrency: 4,
};

export function OptimizePanel() {
  const { t } = useTranslation();
  const datasets = useLiveQuery(
    () => db.datasets.orderBy("createdAt").reverse().toArray(),
    [],
  );
  const providers = useLiveQuery(() => db.providers.toArray(), []);
  const { selectedDatasetId, setSelectedDataset } = useAppStore();
  // 运行状态来自全局 store：切页卸载本组件时后台循环继续，切回从 store 恢复
  // useShallow：多字段 selector 必须用浅比较，否则每次返回新对象导致无限渲染
  const state = useRunStore(
    useShallow((s) => ({
      status: s.status,
      logs: s.logs,
      chart: s.chart,
      currentRound: s.currentRound,
      totalRounds: s.totalRounds,
      currentPrompt: s.currentPrompt,
      bestScore: s.bestScore,
      currentScore: s.currentScore,
      tokens: s.tokens,
      results: s.results,
      lastRound: s.lastRound,
      runId: s.runId,
      errorMessage: s.errorMessage,
    })),
  );
  const start = useRunStore((s) => s.start);
  const stop = useRunStore((s) => s.stop);
  const reset = useRunStore((s) => s.reset);

  const [config, setConfig] = useState<OptimizeConfig>(DEFAULT_CONFIG);
  const [seedChatOpen, setSeedChatOpen] = useState(false);

  const running = state.status === "running";

  // 初始化：选中第一个数据集/默认供应商
  useEffect(() => {
    (async () => {
      if (!datasets) return;
      if (!config.datasetId && datasets.length > 0) {
        const initial =
          datasets.find((d) => d.id === selectedDatasetId) ?? datasets[0];
        setConfig((c) => ({ ...c, datasetId: initial.id }));
      }
      if (!config.providerId) {
        const def = await getDefaultProvider();
        if (def) setConfig((c) => ({ ...c, providerId: def.id }));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasets, providers]);

  // 同步选中数据集到全局
  useEffect(() => {
    setSelectedDataset(config.datasetId || null);
  }, [config.datasetId, setSelectedDataset]);

  const selectedDataset: Dataset | undefined = datasets?.find(
    (d) => d.id === config.datasetId,
  );
  const selectedProvider: Provider | undefined = providers?.find(
    (p) => p.id === config.providerId,
  );
  const judgeProvider: Provider | undefined = providers?.find(
    (p) => p.id === (config.judgeProviderId ?? config.providerId),
  );

  const canStart =
    !running &&
    !!selectedDataset &&
    !!selectedProvider &&
    !!judgeProvider &&
    selectedDataset.samples.length >= 2;

  const handleStart = async () => {
    if (!selectedDataset || !selectedProvider || !judgeProvider) return;
    await start(selectedDataset, selectedProvider, judgeProvider, config);
  };

  // 无数据集/供应商时的引导
  if ((datasets?.length ?? 0) === 0 || (providers?.length ?? 0) === 0) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <PageHeader
          title={t("optimize.title")}
          description={t("optimize.desc")}
        />
        <EmptyState
          icon={<Sparkles className="h-6 w-6" />}
          title={
            (datasets?.length ?? 0) === 0
              ? t("optimize.selectDatasetFirst")
              : t("optimize.selectProviderFirst")
          }
        />
      </div>
    );
  }

  const progress =
    state.totalRounds > 0
      ? (state.currentRound / state.totalRounds) * 100
      : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-3">
      <PageHeader title={t("optimize.title")} description={t("optimize.desc")} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[360px_1fr]">
        {/* 左：配置 */}
        <div className="space-y-3">
          <div className="rounded-lg border bg-card p-3">
            <ConfigForm
              config={config}
              onChange={setConfig}
              disabled={running}
              onSeedChat={() => setSeedChatOpen(true)}
            />
          </div>

          <div className="flex items-center gap-2">
            {!running ? (
              <Button
                className="flex-1"
                onClick={handleStart}
                disabled={!canStart}
              >
                <Play className="h-4 w-4" />
                {t("optimize.start")}
              </Button>
            ) : (
              <Button
                variant="destructive"
                className="flex-1"
                onClick={stop}
              >
                <Square className="h-4 w-4" />
                {t("optimize.stop")}
              </Button>
            )}
            <Button variant="outline" onClick={reset} disabled={running}>
              <RotateCcw className="h-4 w-4" />
              {t("optimize.reset")}
            </Button>
          </div>

          {state.status !== "idle" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{t("optimize.progress")}</span>
                <span className="font-mono">
                  {state.currentRound}/{state.totalRounds}
                  {state.status === "running" && (
                    <span className="ml-2 animate-pulse">{t("optimize.running")}</span>
                  )}
                </span>
              </div>
              <Progress value={progress} />
              {state.status === "done" && (
                <Badge variant="success" className="mt-1">
                  {t("optimize.done", { score: state.bestScore.toFixed(3) })}
                </Badge>
              )}
              {state.status === "error" && state.errorMessage && (
                <p className="text-xs text-destructive break-all">
                  {state.errorMessage}
                </p>
              )}
            </div>
          )}
        </div>

        {/* 右：双栏 日志(3/4) + 图表(1/4) */}
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[3fr_1fr]">
          {/* 左大：日志 + 当前 prompt（tab 切换） */}
          <div className="flex h-[640px] flex-col rounded-lg border bg-card">
            <Tabs defaultValue="log" className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b px-2">
                <TabsList className="h-9 bg-transparent">
                  <TabsTrigger value="log" className="text-xs">
                    {t("optimize.log.title")}
                    {state.logs.length > 0 && (
                      <Badge variant="muted" className="ml-1.5 px-1 text-[10px]">
                        {state.logs.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="prompt" className="text-xs">
                    {t("optimize.currentPrompt")}
                  </TabsTrigger>
                </TabsList>
                {state.lastRound?.changes && (
                  <span className="px-2 text-[11px] text-muted-foreground">
                    {state.lastRound.changes.slice(0, 1).join("; ")}
                  </span>
                )}
              </div>
              <TabsContent value="log" className="mt-0 flex-1 overflow-hidden">
                <LiveLog logs={state.logs} />
              </TabsContent>
              <TabsContent value="prompt" className="mt-0 flex-1 overflow-hidden">
                <PromptPreview prompt={state.currentPrompt} />
              </TabsContent>
            </Tabs>
          </div>

          {/* 右小：图表 + 指标 */}
          <div className="flex flex-col gap-3">
            <MetricCards
              current={state.currentScore}
              best={state.bestScore}
              round={state.currentRound}
              totalRounds={state.totalRounds}
              tokens={state.tokens}
            />
            <div className="h-[300px] rounded-lg border bg-card">
              <ScoreChart data={state.chart} />
            </div>
            {/* 本轮样本结果速览 */}
            {state.results.length > 0 && (
              <div className="rounded-lg border bg-card p-2">
                <div className="mb-1.5 px-1 text-[11px] font-medium text-muted-foreground">
                  本轮样本 · {state.results.length}
                </div>
                <div className="flex max-h-[180px] flex-col gap-1 overflow-auto scrollbar-thin">
                  {state.results.map((r) => (
                    <div
                      key={r.index}
                      className="flex items-center gap-2 rounded px-1.5 py-1 text-xs"
                    >
                      <span
                        className={
                          r.passed
                            ? "text-success"
                            : r.formatPassed
                              ? "text-warning"
                              : "text-destructive"
                        }
                      >
                        {r.passed ? "✓" : r.formatPassed ? "·" : "✗"}
                      </span>
                      <span className="font-mono tabular-nums">
                        {r.score.toFixed(2)}
                      </span>
                      <span className="truncate text-muted-foreground">
                        {r.reason}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 引导式生成初版提示词 */}
      {selectedDataset && selectedProvider && (
        <SeedChatDialog
          open={seedChatOpen}
          onOpenChange={setSeedChatOpen}
          provider={selectedProvider}
          samples={selectedDataset.samples}
          onConfirm={(prompt) =>
            setConfig((c) => ({ ...c, initialPrompt: prompt }))
          }
        />
      )}
    </div>
  );
}
