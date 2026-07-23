import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Database, Trash2, Eye, FileText } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/lib/db";
import { toast } from "@/components/ui/use-toast";
import { formatBytes, downloadFile } from "@/lib/utils";
import type { Dataset } from "@/lib/types";
import { DatasetImport } from "./DatasetImport";

export function DatasetsPanel() {
  const { t } = useTranslation();
  const [importOpen, setImportOpen] = useState(false);
  const [previewDs, setPreviewDs] = useState<Dataset | null>(null);

  const datasets = useLiveQuery(
    () => db.datasets.orderBy("createdAt").reverse().toArray(),
    [],
  );

  const handleDelete = async (ds: Dataset) => {
    if (!confirm(t("common.confirmDelete"))) return;
    await db.datasets.delete(ds.id);
    toast.info(t("common.delete"));
  };

  const handleExport = (ds: Dataset) => {
    downloadFile(
      `${ds.name}.json`,
      JSON.stringify(ds.samples, null, 2),
      "application/json",
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={t("datasets.title")}
        description={t("datasets.desc")}
        actions={
          <Button onClick={() => setImportOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("common.add")}
          </Button>
        }
      />

      {!datasets || datasets.length === 0 ? (
        <EmptyState
          icon={<Database className="h-6 w-6" />}
          title={t("datasets.empty")}
          action={
            <Button onClick={() => setImportOpen(true)}>
              <Plus className="h-4 w-4" />
              {t("common.import")}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3">
          {datasets.map((ds) => (
            <Card key={ds.id}>
              <CardHeader className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium">{ds.name}</span>
                    <Badge variant="muted" className="uppercase">
                      {ds.format}
                    </Badge>
                    <Badge variant="secondary">
                      {t("datasets.samples", { count: ds.samples.length })}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatBytes(new Blob([ds.raw]).size)}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPreviewDs(ds)}
                    >
                      <Eye className="h-4 w-4" />
                      {t("common.preview")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleExport(ds)}
                    >
                      {t("common.export")}
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => handleDelete(ds)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <DatasetImport open={importOpen} onOpenChange={setImportOpen} />

      {/* 预览弹窗 */}
      <Dialog
        open={!!previewDs}
        onOpenChange={(o) => !o && setPreviewDs(null)}
      >
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{previewDs?.name}</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto scrollbar-thin">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead className="w-10">
                    {t("datasets.columns.index")}
                  </TableHead>
                  <TableHead>{t("datasets.columns.input")}</TableHead>
                  <TableHead>{t("datasets.columns.context")}</TableHead>
                  <TableHead>{t("datasets.columns.expected")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewDs?.samples.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-muted-foreground">
                      {i + 1}
                    </TableCell>
                    <TableCell className="max-w-[280px] align-top">
                      <span className="whitespace-pre-wrap break-words text-xs">
                        {s.input}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[200px] align-top">
                      {s.context ? (
                        <span className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                          {s.context}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[280px] align-top">
                      <span className="whitespace-pre-wrap break-words text-xs">
                        {s.expected}
                      </span>
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
