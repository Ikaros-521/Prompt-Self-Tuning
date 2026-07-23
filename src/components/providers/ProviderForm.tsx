import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Check, AlertCircle, Zap } from "lucide-react";
import { db } from "@/lib/db";
import { uid } from "@/lib/utils";
import { chat, listModels } from "@/lib/llm";
import { toast } from "@/components/ui/use-toast";
import type { Provider } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: Provider | null;
}

export function ProviderForm({ open, onOpenChange, provider }: Props) {
  const { t } = useTranslation();
  const providers = useLiveQuery(() => db.providers.toArray(), []);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState<number | "">("");
  const [isDefault, setIsDefault] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);
  const [testMsg, setTestMsg] = useState("");

  useEffect(() => {
    if (open) {
      setName(provider?.name ?? "");
      setBaseUrl(provider?.baseUrl ?? "");
      setApiKey(provider?.apiKey ?? "");
      setModel(provider?.model ?? "");
      setTemperature(provider?.temperature ?? 0.7);
      setMaxTokens(provider?.maxTokens ?? "");
      setIsDefault(provider?.isDefault ?? (providers?.length ?? 0) === 0);
      setTestResult(null);
      setTestMsg("");
    }
  }, [open, provider, providers?.length]);

  const buildProvider = (): Provider => ({
    id: provider?.id ?? uid("prov"),
    name: name.trim() || "unnamed",
    baseUrl: baseUrl.trim(),
    apiKey: apiKey.trim(),
    model: model.trim(),
    temperature,
    maxTokens: maxTokens === "" ? undefined : Number(maxTokens),
    isDefault,
    createdAt: provider?.createdAt ?? Date.now(),
  });

  const handleTest = async () => {
    if (!baseUrl.trim() || !model.trim()) {
      toast.error(t("providers.testFailed", { error: "missing fields" }));
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      await chat({
        provider: buildProvider(),
        messages: [
          { role: "user", content: "Say OK if you can read this." },
        ],
        temperature: 0,
        maxTokens: 16,
      });
      setTestResult("ok");
      setTestMsg(t("providers.testSuccess"));
      toast.success(t("providers.testSuccess"));
    } catch (e) {
      setTestResult("fail");
      const msg = e instanceof Error ? e.message : String(e);
      setTestMsg(msg);
      toast.error(t("providers.testFailed", { error: msg }));
    } finally {
      setTesting(false);
    }
  };

  const handleFetchModels = async () => {
    if (!baseUrl.trim()) return;
    const models = await listModels(buildProvider());
    if (models.length > 0) {
      toast.info(`找到 ${models.length} 个模型`);
      // 简单：把第一个模型填入便于调试，用户可手动改
      if (!model && models.length) setModel(models[0]);
    } else {
      toast.info("该端点未返回模型列表，请手动填写 model");
    }
  };

  const handleSave = async () => {
    if (!baseUrl.trim() || !model.trim()) {
      toast.error(t("providers.testFailed", { error: "base_url & model 必填" }));
      return;
    }
    const p = buildProvider();
    await db.transaction("rw", db.providers, async () => {
      await db.providers.put(p);
      if (isDefault) {
        const all = await db.providers.toArray();
        for (const x of all) {
          if (x.id !== p.id) {
            await db.providers.update(x.id, { isDefault: false });
          }
        }
      }
    });
    toast.success(t("common.save"));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {provider ? t("providers.editProvider") : t("providers.addNew")}
          </DialogTitle>
          <DialogDescription>{t("providers.desc")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-name">{t("providers.fields.name")}</Label>
              <Input
                id="p-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-model">{t("providers.fields.model")}</Label>
              <div className="flex gap-1.5">
                <Input
                  id="p-model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={t("providers.fields.modelPlaceholder")}
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleFetchModels}
                  type="button"
                  title="获取模型列表"
                >
                  ↻
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-url">{t("providers.fields.baseUrl")}</Label>
            <Input
              id="p-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={t("providers.fields.baseUrlPlaceholder")}
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-key">{t("providers.fields.apiKey")}</Label>
            <Input
              id="p-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={t("providers.fields.apiKeyPlaceholder")}
              className="font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                {t("providers.fields.temperature")} ({temperature.toFixed(2)})
              </Label>
              <Input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("providers.fields.maxTokens")}</Label>
              <Input
                type="number"
                min={1}
                value={maxTokens}
                onChange={(e) =>
                  setMaxTokens(e.target.value === "" ? "" : Number(e.target.value))
                }
                placeholder="auto"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="p-default">{t("common.setAsDefault")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("providers.desc")}
              </p>
            </div>
            <Switch
              id="p-default"
              checked={isDefault}
              onCheckedChange={setIsDefault}
            />
          </div>

          {testResult === "ok" && (
            <div className="flex items-center gap-2 text-sm text-success">
              <Check className="h-4 w-4" />
              {testMsg}
            </div>
          )}
          {testResult === "fail" && (
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="break-all">{testMsg}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={testing}
            className="mr-auto"
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            {testing ? t("providers.testing") : t("providers.testConnection")}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave}>
            <Check className="h-4 w-4" />
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
