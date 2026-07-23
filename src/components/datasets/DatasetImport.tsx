import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Upload, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/lib/db";
import { parseDataset, detectFormat, reparseTxt } from "@/lib/parser";
import { uid } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import type { DatasetFormat, Dataset, Sample } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DatasetImport({ open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [raw, setRaw] = useState("");
  const [format, setFormat] = useState<DatasetFormat | "auto">("auto");
  const [delimiter, setDelimiter] = useState("=>");
  const [samples, setSamples] = useState<Sample[]>([]);
  const [error, setError] = useState<string | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setName("");
    setRaw("");
    setFormat("auto");
    setDelimiter("=>");
    setSamples([]);
    setError(undefined);
  };

  const doParse = useCallback(
    (text: string, fmt: DatasetFormat | "auto", delim: string) => {
      if (!text.trim()) {
        setSamples([]);
        setError(undefined);
        return;
      }
      let result;
      if (fmt === "auto") {
        result = parseDataset(text);
        // 若自动识别为 txt，应用用户分隔符
        if (result.format === "txt") {
          result = reparseTxt(text, delim);
        }
      } else if (fmt === "txt") {
        result = reparseTxt(text, delim);
      } else {
        // 强制格式
        result =
          fmt === "jsonl"
            ? parseJsonlForced(text)
            : parseJsonForced(text);
      }
      setSamples(result.samples);
      setError(result.error);
    },
    [],
  );

  const handleTextChange = (text: string) => {
    setRaw(text);
    doParse(text, format, delimiter);
  };

  const handleFormatChange = (fmt: DatasetFormat | "auto") => {
    setFormat(fmt);
    doParse(raw, fmt, delimiter);
  };

  const handleDelimiterChange = (delim: string) => {
    setDelimiter(delim);
    doParse(raw, format === "auto" ? "auto" : format, delim);
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
      handleTextChange(text);
    };
    reader.readAsText(file);
  };

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [raw, format, delimiter],
  );

  const detected = raw.trim() ? detectFormat(raw.trim()) : null;

  const handleSave = async () => {
    if (samples.length === 0) {
      toast.error(t("datasets.parseFailed", { error: error ?? "no samples" }));
      return;
    }
    const ds: Dataset = {
      id: uid("ds"),
      name: name.trim() || `dataset-${Date.now()}`,
      format: format === "auto" ? detected ?? "txt" : format,
      samples,
      raw,
      createdAt: Date.now(),
    };
    await db.datasets.add(ds);
    toast.success(t("datasets.importSuccess", { count: samples.length }));
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("datasets.importTitle")}</DialogTitle>
          <DialogDescription>{t("datasets.desc")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 overflow-auto pr-1">
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ds-name">{t("datasets.datasetName")}</Label>
              <Input
                id="ds-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("datasets.datasetNamePlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("datasets.formatDetected")}</Label>
              <div className="flex h-9 items-center gap-2">
                {detected ? (
                  <Badge variant="secondary" className="uppercase">
                    {detected}
                  </Badge>
                ) : (
                  <Badge variant="muted">{t("datasets.formatAuto")}</Badge>
                )}
              </div>
            </div>
          </div>

          {/* 拖拽/粘贴区 */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className="space-y-1.5"
          >
            <Label>{t("common.import")}</Label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="relative"
            >
              <Textarea
                value={raw}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder={t("datasets.importHint")}
                className="min-h-[120px] font-mono text-xs"
                onClick={(e) => e.stopPropagation()}
              />
              <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Upload className="h-3 w-3" />
                {t("datasets.importHint")}
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".jsonl,.json,.txt,.md,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </div>

          {/* 格式 & 分隔符控制 */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("datasets.formatDetected")}</Label>
              <div className="flex gap-1">
                {(["auto", "jsonl", "json", "txt"] as const).map((f) => (
                  <Button
                    key={f}
                    size="sm"
                    variant={format === f ? "default" : "outline"}
                    onClick={() => handleFormatChange(f)}
                    className="uppercase"
                  >
                    {f}
                  </Button>
                ))}
              </div>
            </div>
            {(format === "auto" ? detected === "txt" : format === "txt") && (
              <div className="space-y-1.5">
                <Label className="text-xs">{t("datasets.delimiter")}</Label>
                <Input
                  value={delimiter}
                  onChange={(e) => handleDelimiterChange(e.target.value)}
                  placeholder={t("datasets.delimiterPlaceholder")}
                  className="w-24 font-mono"
                />
              </div>
            )}
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : samples.length > 0 ? (
            <Alert variant="success">
              <AlertDescription>
                {t("datasets.parsedCount", { count: samples.length })}
              </AlertDescription>
            </Alert>
          ) : null}

          {/* 预览 */}
          {samples.length > 0 && (
            <div className="rounded-md border">
              <div className="border-b bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                {t("common.preview")} · {samples.length} / {samples.length}
              </div>
              <div className="max-h-[260px] overflow-auto scrollbar-thin">
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
                    {samples.slice(0, 100).map((s, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-muted-foreground">
                          {i + 1}
                        </TableCell>
                        <TableCell className="max-w-[260px] align-top">
                          <span className="line-clamp-3 whitespace-pre-wrap break-words text-xs">
                            {s.input}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[180px] align-top">
                          {s.context ? (
                            <span className="line-clamp-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                              {s.context}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[260px] align-top">
                          <span className="line-clamp-3 whitespace-pre-wrap break-words text-xs">
                            {s.expected}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={samples.length === 0}>
            <Check className="h-4 w-4" />
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* 强制按指定格式解析（覆盖自动检测） */
function parseJsonlForced(text: string): ParseResultLike {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const samples: Sample[] = [];
  let skipped = 0;
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj && typeof obj === "object") {
        const s = normalizeSample(obj);
        if (s) samples.push(s);
        else skipped++;
      } else skipped++;
    } catch {
      skipped++;
    }
  }
  return {
    samples,
    error:
      samples.length === 0
        ? `JSONL 解析失败，跳过 ${skipped} 行`
        : undefined,
  };
}

function parseJsonForced(text: string): ParseResultLike {
  let arr: unknown;
  try {
    arr = JSON.parse(text);
  } catch {
    return { samples: [], error: "JSON 解析失败" };
  }
  if (!Array.isArray(arr)) {
    return { samples: [], error: "JSON 不是数组" };
  }
  const samples: Sample[] = [];
  let skipped = 0;
  for (const item of arr) {
    if (item && typeof item === "object") {
      const s = normalizeSample(item as Record<string, unknown>);
      if (s) samples.push(s);
      else skipped++;
    }
  }
  return {
    samples,
    error:
      samples.length === 0
        ? `未能识别字段，跳过 ${skipped} 条`
        : undefined,
  };
}

interface ParseResultLike {
  samples: Sample[];
  error?: string;
}

function normalizeSample(obj: Record<string, unknown>): Sample | null {
  const get = (keys: string[]) => {
    for (const k of keys) {
      const found = Object.keys(obj).find(
        (fk) => fk.toLowerCase().trim() === k,
      );
      if (found && typeof obj[found] === "string") {
        const v = (obj[found] as string).trim();
        if (v) return v;
      }
    }
    return undefined;
  };
  const input = get(["input", "question", "prompt", "q", "query", "instruction"]);
  const expected = get([
    "expected",
    "answer",
    "output",
    "a",
    "expected_output",
    "response",
    "target",
  ]);
  const context = get(["context", "background", "ctx", "passage", "document"]);
  if (!input || !expected) return null;
  return { input, expected, context };
}
