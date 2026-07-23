import { useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { TabNav } from "@/components/layout/TabNav";
import { Toaster } from "@/components/ui/Toaster";
import { useAppStore } from "@/store/useAppStore";
import { requestPersistentStorage } from "@/lib/utils";
import { DatasetsPanel } from "@/components/datasets/DatasetsPanel";
import { ProvidersPanel } from "@/components/providers/ProvidersPanel";
import { OptimizePanel } from "@/components/optimize/OptimizePanel";
import { EvaluatePanel } from "@/components/evaluate/EvaluatePanel";
import { PromptLibraryPanel } from "@/components/prompts/PromptLibraryPanel";

export default function App() {
  const { activeTab } = useAppStore();

  // 启动时申请持久化存储，避免数据被浏览器清理
  useEffect(() => {
    requestPersistentStorage();
  }, []);

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
      </main>
      <Toaster />
    </div>
  );
}
