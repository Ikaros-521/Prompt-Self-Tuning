import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n/config";
import { Header } from "@/components/layout/Header";
import { TabNav } from "@/components/layout/TabNav";
import { Toaster } from "@/components/ui/Toaster";
import { useAppStore } from "@/store/useAppStore";
import { setT } from "@/store/useRunStore";
import { requestPersistentStorage } from "@/lib/utils";
import { DatasetsPanel } from "@/components/datasets/DatasetsPanel";
import { ProvidersPanel } from "@/components/providers/ProvidersPanel";
import { OptimizePanel } from "@/components/optimize/OptimizePanel";
import { EvaluatePanel } from "@/components/evaluate/EvaluatePanel";
import { PromptLibraryPanel } from "@/components/prompts/PromptLibraryPanel";
import { TestPanel } from "@/components/test/TestPanel";

export default function App() {
  const { activeTab } = useAppStore();
  const { t } = useTranslation();

  // 启动时申请持久化存储，避免数据被浏览器清理
  useEffect(() => {
    requestPersistentStorage();
  }, []);

  // 注入 i18n 的 t 到全局 run store（store 内不能用 useTranslation hook）
  // 语言切换时同步更新，保证运行中切语言日志也能正确翻译
  useEffect(() => {
    setT(t);
    const handler = () => setT(t);
    i18n.on("languageChanged", handler);
    return () => {
      i18n.off("languageChanged", handler);
    };
  }, [t]);

  return (
    <div className="flex h-screen flex-col bg-background">
      <Header />
      <TabNav />
      <main className="density-tight flex-1 overflow-auto p-4">
        {activeTab === "datasets" && <DatasetsPanel />}
        {activeTab === "providers" && <ProvidersPanel />}
        {activeTab === "optimize" && <OptimizePanel />}
        {activeTab === "evaluate" && <EvaluatePanel />}
        {activeTab === "prompts" && <PromptLibraryPanel />}
        {activeTab === "test" && <TestPanel />}
      </main>
      <Toaster />
    </div>
  );
}
