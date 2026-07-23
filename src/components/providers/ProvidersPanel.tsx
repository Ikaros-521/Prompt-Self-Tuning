import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Server, Trash2, Pencil, Zap, Star } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { db } from "@/lib/db";
import { toast } from "@/components/ui/use-toast";
import type { Provider } from "@/lib/types";
import { ProviderForm } from "./ProviderForm";

const PRESETS = [
  {
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
    hint: "CORS 友好，推荐",
  },
  {
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    hint: "OpenAI 兼容",
  },
  {
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
    hint: "CORS 可能不稳定",
  },
  {
    name: "自定义",
    baseUrl: "",
    model: "",
    hint: "自部署 one-api/new-api/LiteLLM",
  },
];

export function ProvidersPanel() {
  const { t } = useTranslation();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Provider | null>(null);

  const providers = useLiveQuery(
    () => db.providers.orderBy("createdAt").toArray(),
    [],
  );

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (p: Provider) => {
    setEditing(p);
    setFormOpen(true);
  };

  const handleDelete = async (p: Provider) => {
    if (!confirm(t("common.confirmDelete"))) return;
    await db.providers.delete(p.id);
    toast.info(t("common.delete"));
  };

  const handlePreset = async (preset: (typeof PRESETS)[number]) => {
    const p: Provider = {
      id: `prov_${Date.now().toString(36)}`,
      name: preset.name,
      baseUrl: preset.baseUrl,
      apiKey: "",
      model: preset.model,
      createdAt: Date.now(),
    };
    await db.providers.add(p);
    setEditing(p);
    setFormOpen(true);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title={t("providers.title")}
        description={t("providers.desc")}
        actions={
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" />
            {t("providers.addNew")}
          </Button>
        }
      />

      <Alert variant="warning">
        <AlertTitle className="text-warning">⚠ CORS</AlertTitle>
        <AlertDescription>{t("providers.corsWarning")}</AlertDescription>
      </Alert>

      {/* 预设 */}
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          {t("providers.presets")}
        </span>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset.name}
              variant="outline"
              size="sm"
              onClick={() => handlePreset(preset)}
            >
              <Zap className="h-3.5 w-3.5" />
              {preset.name}
              <span className="text-[10px] text-muted-foreground">
                {preset.hint}
              </span>
            </Button>
          ))}
        </div>
      </div>

      {!providers || providers.length === 0 ? (
        <EmptyState
          icon={<Server className="h-6 w-6" />}
          title={t("providers.empty")}
        />
      ) : (
        <div className="grid gap-2">
          {providers.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex items-center justify-between gap-3 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Server className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{p.name}</span>
                      {p.isDefault && (
                        <Badge variant="success">
                          <Star className="mr-1 h-3 w-3" />
                          {t("common.default")}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="truncate font-mono">{p.baseUrl}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
                        {p.model}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                    <Pencil className="h-4 w-4" />
                    {t("common.edit")}
                  </Button>
                  {!p.isDefault && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await db.transaction("rw", db.providers, async () => {
                          for (const x of providers) {
                            await db.providers.update(x.id, {
                              isDefault: x.id === p.id,
                            });
                          }
                        });
                        toast.success(t("common.setAsDefault"));
                      }}
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => handleDelete(p)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Alert variant="info">
        <AlertDescription>{t("providers.securityNote")}</AlertDescription>
      </Alert>

      <ProviderForm
        open={formOpen}
        onOpenChange={setFormOpen}
        provider={editing}
      />
    </div>
  );
}
