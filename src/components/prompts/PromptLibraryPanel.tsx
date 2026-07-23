import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Library,
  Eye,
  Download,
  Copy,
  GitBranch,
  Trophy,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { db } from "@/lib/db";
import { downloadFile } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import type { PromptVersion } from "@/lib/types";

const statusVariant: Record<
  PromptVersion["status"],
  "success" | "muted" | "secondary"
> = {
  adopted: "success",
  discarded: "muted",
  baseline: "secondary",
};

export function PromptLibraryPanel() {
  const { t } = useTranslation();
  const [datasetFilter, setDatasetFilter] = useState<string>("__all__");
  const [viewVersion, setViewVersion] = useState<PromptVersion | null>(null);

  const datasets = useLiveQuery(() => db.datasets.toArray(), []);
  const versions = useLiveQuery(
    async () => {
      const all = await db.promptVersions.toArray();
      const filtered =
        datasetFilter === "__all__"
          ? all
          : all.filter((v) => v.datasetId === datasetFilter);
      return filtered.sort((a, b) => {
        // 先按数据集分组，再按分数降序
        if (a.datasetId !== b.datasetId) return a.datasetId.localeCompare(b.datasetId);
        return b.score - a.score;
      });
    },
    [datasetFilter],
  );

  const datasetName = (id: string) =>
    datasets?.find((d) => d.id === id)?.name ?? id.slice(0, 8);

  const handleCopy = async (v: PromptVersion) => {
    try {
      await navigator.clipboard.writeText(v.content);
      toast.success(t("common.copied"));
    } catch {
      toast.error("复制失败");
    }
  };

  const handleExportJson = (v: PromptVersion) => {
    downloadFile(
      `prompt_v${v.version}_${datasetName(v.datasetId)}.json`,
      JSON.stringify(v, null, 2),
    );
  };

  const handleExportTxt = (v: PromptVersion) => {
    downloadFile(
      `prompt_v${v.version}_${datasetName(v.datasetId)}.txt`,
      v.content,
      "text/plain",
    );
  };

  if (!versions || versions.length === 0) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <PageHeader title={t("prompts.title")} description={t("prompts.desc")} />
        <EmptyState icon={<Library className="h-6 w-6" />} title={t("prompts.empty")} />
      </div>
    );
  }

  // 找每个数据集的最高分版本
  const bestByVersion = new Map<string, number>();
  for (const v of versions) {
    const cur = bestByVersion.get(v.datasetId) ?? -1;
    if (v.score > cur) bestByVersion.set(v.datasetId, v.score);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        title={t("prompts.title")}
        description={t("prompts.desc")}
        actions={
          <Select value={datasetFilter} onValueChange={setDatasetFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("common.none")}</SelectItem>
              {datasets?.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">{t("prompts.filterDataset")}</TableHead>
                <TableHead className="w-16">{t("prompts.columns.version")}</TableHead>
                <TableHead className="w-16">{t("prompts.columns.round")}</TableHead>
                <TableHead className="w-24">{t("prompts.columns.score")}</TableHead>
                <TableHead className="w-24">{t("prompts.columns.status")}</TableHead>
                <TableHead>{t("prompts.columns.changes")}</TableHead>
                <TableHead className="w-[120px] text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {versions.map((v) => {
                const isBest = v.score === bestByVersion.get(v.datasetId);
                return (
                  <TableRow key={v.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {datasetName(v.datasetId)}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">v{v.version}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      R{v.round}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 font-mono text-sm tabular-nums">
                        {isBest && <Trophy className="h-3 w-3 text-success" />}
                        {v.score.toFixed(3)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[v.status]}>
                        {t(`prompts.status.${v.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <span className="line-clamp-2 text-xs text-muted-foreground">
                        {v.changes.join("；") || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => setViewVersion(v)}
                          title={t("prompts.viewContent")}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => handleCopy(v)}
                          title={t("prompts.copyContent")}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => handleExportJson(v)}
                          title={t("prompts.exportJson")}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 内容查看弹窗 */}
      <Dialog
        open={!!viewVersion}
        onOpenChange={(o) => !o && setViewVersion(null)}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              v{viewVersion?.version} · {viewVersion && datasetName(viewVersion.datasetId)}
              <Badge variant="secondary">{viewVersion?.score.toFixed(3)}</Badge>
            </DialogTitle>
          </DialogHeader>
          {viewVersion?.changes && viewVersion.changes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {viewVersion.changes.map((c, i) => (
                <Badge key={i} variant="muted" className="text-[11px]">
                  {c}
                </Badge>
              ))}
            </div>
          )}
          <pre className="overflow-auto scrollbar-thin whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
            {viewVersion?.content}
          </pre>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => viewVersion && handleExportTxt(viewVersion)}
            >
              <Download className="h-4 w-4" />
              {t("prompts.exportTxt")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => viewVersion && handleCopy(viewVersion)}
            >
              <Copy className="h-4 w-4" />
              {t("prompts.copyContent")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
