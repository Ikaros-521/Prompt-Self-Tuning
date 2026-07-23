import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import { Database, Server, Settings2, FileText, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState } from "react";
import { db } from "@/lib/db";
import type { OptimizeConfig } from "@/lib/types";

interface Props {
  config: OptimizeConfig;
  onChange: (c: OptimizeConfig) => void;
  disabled?: boolean;
  /** 引导式生成入口（步骤 B），不传则隐藏该按钮 */
  onSeedChat?: () => void;
}

type InitialMode = "auto" | "prompt" | "guidance";

export function ConfigForm({ config, onChange, disabled, onSeedChat }: Props) {
  const { t } = useTranslation();
  const datasets = useLiveQuery(() => db.datasets.orderBy("createdAt").reverse().toArray(), []);
  const providers = useLiveQuery(() => db.providers.orderBy("createdAt").toArray(), []);

  // 初版模式由当前已填内容推断，便于回显
  const [initialMode, setInitialMode] = useState<InitialMode>(() => {
    if (config.initialPrompt?.trim()) return "prompt";
    if (config.userGuidance?.trim()) return "guidance";
    return "auto";
  });

  const set = <K extends keyof OptimizeConfig>(key: K, value: OptimizeConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  /** 切换模式：切走时清掉另一字段，避免两个字段都有值造成歧义 */
  const switchMode = (m: InitialMode) => {
    setInitialMode(m);
    if (m === "auto") {
      onChange({ ...config, initialPrompt: undefined, userGuidance: undefined });
    } else if (m === "prompt") {
      onChange({ ...config, userGuidance: undefined });
    } else {
      onChange({ ...config, initialPrompt: undefined });
    }
  };

  const clearInitial = () => {
    onChange({ ...config, initialPrompt: undefined, userGuidance: undefined });
    setInitialMode("auto");
  };

  return (
    <div className="space-y-3">
      {/* 基础配置 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1">
            <Database className="h-3 w-3" />
            {t("optimize.config.dataset")}
          </Label>
          <Select
            value={config.datasetId}
            onValueChange={(v) => set("datasetId", v)}
            disabled={disabled}
          >
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

        <div className="space-y-1.5">
          <Label className="flex items-center gap-1">
            <Server className="h-3 w-3" />
            {t("optimize.config.provider")}
          </Label>
          <Select
            value={config.providerId}
            onValueChange={(v) => set("providerId", v)}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("common.select")} />
            </SelectTrigger>
            <SelectContent>
              {providers?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} · {p.model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 核心超参（平铺） */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-md border p-3">
        <SliderField
          label={t("optimize.config.maxRounds")}
          value={config.maxRounds}
          min={1}
          max={30}
          step={1}
          disabled={disabled}
          onChange={(v) => set("maxRounds", v)}
          suffix={String(config.maxRounds)}
        />
        <SliderField
          label={t("optimize.config.sampleSize")}
          value={config.sampleSize}
          min={1}
          max={50}
          step={1}
          disabled={disabled}
          onChange={(v) => set("sampleSize", v)}
          suffix={String(config.sampleSize)}
        />
        <SliderField
          label={t("optimize.config.executorTemperature")}
          value={config.executorTemperature}
          min={0}
          max={2}
          step={0.1}
          disabled={disabled}
          onChange={(v) => set("executorTemperature", v)}
          suffix={config.executorTemperature.toFixed(1)}
        />
        <SliderField
          label={t("optimize.config.scoreThreshold")}
          value={config.scoreThreshold}
          min={0.5}
          max={1}
          step={0.05}
          disabled={disabled}
          onChange={(v) => set("scoreThreshold", v)}
          suffix={config.scoreThreshold.toFixed(2)}
          tooltip={t("optimize.config.scoreThresholdHint")}
        />
      </div>

      {/* 初版提示词（折叠，可选） */}
      <Accordion type="single" collapsible defaultValue={undefined}>
        <AccordionItem value="initial" className="border-0">
          <AccordionTrigger className="text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              {t("optimize.config.initialPromptTitle")}
              {initialMode !== "auto" && (
                <Badge variant="secondary" className="ml-1 text-[10px]">
                  {t(`optimize.config.initialMode${initialMode === "prompt" ? "Prompt" : "Guidance"}`)}
                </Badge>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2">
              {/* 模式切换 */}
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">
                  {t("optimize.config.initialMode")}:
                </span>
                <div className="flex gap-1">
                  {(["auto", "prompt", "guidance"] as const).map((m) => (
                    <Button
                      key={m}
                      size="sm"
                      variant={initialMode === m ? "default" : "outline"}
                      className="h-7 px-2 text-xs"
                      disabled={disabled}
                      onClick={() => switchMode(m)}
                    >
                      {t(`optimize.config.initialMode${m === "auto" ? "Auto" : m === "prompt" ? "Prompt" : "Guidance"}`)}
                    </Button>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground">
                {t("optimize.config.initialPromptHint")}
              </p>

              {/* 输入区：仅 prompt/guidance 模式显示 */}
              {initialMode !== "auto" && (
                <div className="relative">
                  <Textarea
                    value={
                      initialMode === "prompt"
                        ? config.initialPrompt ?? ""
                        : config.userGuidance ?? ""
                    }
                    onChange={(e) =>
                      initialMode === "prompt"
                        ? set("initialPrompt", e.target.value)
                        : set("userGuidance", e.target.value)
                    }
                    disabled={disabled}
                    placeholder={
                      initialMode === "prompt"
                        ? t("optimize.config.initialPromptPlaceholder")
                        : t("optimize.config.userGuidancePlaceholder")
                    }
                    className="min-h-[100px] resize-y font-mono text-xs"
                  />
                  {(config.initialPrompt || config.userGuidance) && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="absolute right-1.5 top-1.5"
                      disabled={disabled}
                      onClick={() => clearInitial()}
                      title={t("optimize.config.initialClear")}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              )}

              {/* 引导式生成入口（步骤 B 接入） */}
              {onSeedChat && initialMode !== "auto" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={disabled}
                  onClick={onSeedChat}
                >
                  ✨ {t("optimize.seedChat.open")}
                </Button>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* 高级设置（折叠） */}
      <Accordion type="single" collapsible>
        <AccordionItem value="advanced" className="border-0">
          <AccordionTrigger className="text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Settings2 className="h-3.5 w-3.5" />
              {t("optimize.config.advanced")}
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div className="space-y-1.5">
                <Label>{t("optimize.config.judgeProvider")}</Label>
                <Select
                  value={config.judgeProviderId ?? "__same__"}
                  onValueChange={(v) =>
                    set("judgeProviderId", v === "__same__" ? undefined : v)
                  }
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__same__">
                      {t("optimize.config.provider")}（默认）
                    </SelectItem>
                    {providers?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · {p.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {t("optimize.config.judgeProviderHint")}
                </p>
              </div>

              <SliderField
                label={t("optimize.config.trainRatio")}
                value={config.trainRatio}
                min={0.5}
                max={0.95}
                step={0.05}
                disabled={disabled}
                onChange={(v) => set("trainRatio", v)}
                suffix={Math.round(config.trainRatio * 100) + "%"}
              />

              <SliderField
                label={t("optimize.config.convergenceRounds")}
                value={config.convergenceRounds}
                min={1}
                max={10}
                step={1}
                disabled={disabled}
                onChange={(v) => set("convergenceRounds", v)}
                suffix={String(config.convergenceRounds)}
                tooltip={t("optimize.config.convergenceRoundsHint")}
              />

              <div className="flex items-center justify-between rounded-md border p-2.5">
                <Label htmlFor="auto-stop" className="text-xs">
                  {t("optimize.config.agentAutoStop")}
                </Label>
                <Switch
                  id="auto-stop"
                  checked={config.agentAutoStop}
                  onCheckedChange={(v) => set("agentAutoStop", v)}
                  disabled={disabled}
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  disabled,
  suffix,
  tooltip,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  suffix?: string;
  tooltip?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1 text-xs">
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help border-b border-dotted border-muted-foreground">
                {label}
              </span>
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        ) : (
          <span>{label}</span>
        )}
        <span className="ml-auto font-mono tabular-nums text-foreground">
          {suffix}
        </span>
      </Label>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(arr) => onChange(arr[0])}
      />
    </div>
  );
}
