import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import { BarChart3, Play, Square, Check } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { db, getDefaultProvider } from "@/lib/db";
import { evaluatePrompt, summarizeEval, type EvalSummary } from "@/lib/evaluate";
import { toast } from "@/components/ui/use-toast";
import type { CaseResult, PromptVersion } from "@/lib/types";

export function EvaluatePanel() {
  const { t } = useTranslation();
  const datasets = useLiveQuery(() => db.datasets.toArray(), []);
  const providers = useLiveQuery(() => db.providers.toArray(), []);

  const [datasetId, setDatasetId] = useState<string>("");
  const [selectedVersionIds, setSelectedVersionIds] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ cur: 0, total: 0, label: "" });
  const [summaries, setSummaries] = useState<EvalSummary[]>([]);
  const [caseView, setCaseView] = useState<{
    versionId: string;
    results: CaseResult[];
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const versions = useLiveQuery(async () => {
    if (!datasetId) return [];
    const all = await db.promptVersions.where("datasetId").equals(datasetId).toArray();
    return all.sort((a, b) => b.score - a.score);
  }, [datasetId]);

  const dataset = datasets?.find((d) => d.id === datasetId);

  const toggleVersion = (id: string) => {
    setSelectedVersionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleRun = async () => {
    if (!dataset) return;
    const judge = await getDefaultProvider();
    const executor = judge;
    if (!executor) {
      toast.error(t("optimize.selectProviderFirst"));
      return;
    }
    const selected = (versions ?? []).filter((v) =>
      selectedVersionIds.includes(v.id),
    );
    if (selected.length === 0) {
      toast.error(t("evaluate.selectVersions"));
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setSummaries([]);

    try {
      const results: EvalSummary[] = [];
      const threshold = 0.7;
      for (let vi = 0; vi < selected.length; vi++) {
        const v = selected[vi];
        const caseResults: CaseResult[] = [];
        for await (const ev of evaluatePrompt(
          executor,
          judge,
          v.content,
          dataset,
          threshold,
          controller.signal,
        )) {
          if (ev.result) caseResults.push(ev.result);
          setProgress({
            cur: ev.index + 1 + vi * dataset.samples.length,
            total: dataset.samples.length * selected.length,
            label: `v${v.version} (${vi + 1}/${selected.length})`,
          });
        }
        results.push(summarizeEval(v.id, caseResults, threshold));
        setSummaries([...results]);
      }
      toast.success(t("evaluate.title"));
    } catch (e) {
      if (controller.signal.aborted) {
        toast.info(t("optimize.stopped"));
      } else {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setRunning(false);
      setProgress({ cur: 0, total: 0, label: "" });
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  if ((datasets?.length ?? 0) === 0) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <PageHeader title={t("evaluate.title")} description={t("evaluate.desc")} />
        <EmptyState icon={<BarChart3 className="h-6 w-6" />} title={t("evaluate.empty")} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title={t("evaluate.title")} description={t("evaluate.desc")} />

      {/* 选择区 */}
      <Card>
        <CardContent className="space-y-3 p-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("evaluate.selectDataset")}
              </label>
              <Select value={datasetId} onValueChange={setDatasetId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("common.select")} />
                </SelectTrigger>
                <SelectContent>
                  {datasets?.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} · {d.samples.length}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              {!running ? (
                <Button
                  onClick={handleRun}
                  disabled={
                    !dataset ||
                    selectedVersionIds.length === 0 ||
                    (providers?.length ?? 0) === 0
                  }
                  className="w-full"
                >
                  <Play className="h-4 w-4" />
                  {t("evaluate.runEval")}
                </Button>
              ) : (
                <Button variant="destructive" onClick={handleStop} className="w-full">
                  <Square className="h-4 w-4" />
                  {t("evaluate.running")}
                </Button>
              )}
            </div>
          </div>

          {running && progress.total > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{progress.label}</span>
                <span className="font-mono">
                  {progress.cur}/{progress.total}
                </span>
              </div>
              <Progress value={(progress.cur / progress.total) * 100} />
            </div>
          )}

          {/* 版本多选 */}
          {datasetId && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("evaluate.selectVersions")} · {versions?.length ?? 0}
              </label>
              <div className="grid max-h-[200px] gap-1 overflow-auto scrollbar-thin rounded-md border p-2">
                {(versions ?? []).length === 0 ? (
                  <span className="px-2 py-3 text-center text-xs text-muted-foreground">
                    {t("prompts.empty")}
                  </span>
                ) : (
                  versions?.map((v: PromptVersion) => (
                    <label
                      key={v.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-accent"
                    >
                      <input
                        type="checkbox"
                        checked={selectedVersionIds.includes(v.id)}
                        onChange={() => toggleVersion(v.id)}
                        className="h-4 w-4 accent-primary"
                      />
                      <span className="font-mono text-xs">v{v.version}</span>
                      <Badge variant="secondary">{v.score.toFixed(3)}</Badge>
                      <span className="line-clamp-1 flex-1 text-xs text-muted-foreground">
                        {v.changes.join("；")}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 结果对比表 */}
      {summaries.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">{t("evaluate.columns.version")}</TableHead>
                  <TableHead className="w-28">{t("evaluate.columns.score")}</TableHead>
                  <TableHead className="w-28">{t("evaluate.columns.passRate")}</TableHead>
                  <TableHead>{t("evaluate.columns.changes")}</TableHead>
                  <TableHead className="w-24 text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.map((s) => {
                  const v = versions?.find((x) => x.id === s.promptId);
                  const bestAvg = Math.max(...summaries.map((x) => x.avgScore));
                  return (
                    <TableRow key={s.promptId}>
                      <TableCell>
                        <span className="font-mono text-xs">v{v?.version}</span>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 font-mono">
                          {s.avgScore === bestAvg && (
                            <Check className="h-3 w-3 text-success" />
                          )}
                          {s.avgScore.toFixed(3)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono">
                          {(s.passRate * 100).toFixed(0)}%
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[260px]">
                        <span className="line-clamp-1 text-xs text-muted-foreground">
                          {v?.changes.join("；") || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setCaseView({ versionId: s.promptId, results: s.results })
                          }
                        >
                          {t("evaluate.viewCase")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* 案例详情 */}
      <Dialog
        open={!!caseView}
        onOpenChange={(o) => !o && setCaseView(null)}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {t("evaluate.viewCase")} ·{" "}
              {versions?.find((x) => x.id === caseView?.versionId)?.version !== undefined
                ? `v${versions?.find((x) => x.id === caseView?.versionId)?.version}`
                : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto scrollbar-thin">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead className="w-16">{t("prompts.columns.score")}</TableHead>
                  <TableHead>{t("datasets.columns.input")}</TableHead>
                  <TableHead>{t("datasets.columns.expected")}</TableHead>
                  <TableHead>实际输出</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {caseView?.results.map((r) => (
                  <TableRow key={r.index}>
                    <TableCell className="text-muted-foreground">{r.index + 1}</TableCell>
                    <TableCell>
                      <span
                        className={
                          r.passed
                            ? "font-mono text-success"
                            : r.formatPassed
                              ? "font-mono text-warning"
                              : "font-mono text-destructive"
                        }
                      >
                        {r.score.toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[200px] align-top">
                      <span className="whitespace-pre-wrap break-words text-xs">
                        {r.input}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[200px] align-top">
                      <span className="whitespace-pre-wrap break-words text-xs">
                        {r.expected}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[220px] align-top">
                      <span className="whitespace-pre-wrap break-words text-xs">
                        {r.actual}
                      </span>
                      {r.reason && (
                        <span className="mt-1 block text-[11px] text-muted-foreground">
                          {r.reason}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
