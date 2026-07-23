import { useTranslation } from "react-i18next";
import {
  Database,
  Server,
  Sparkles,
  BarChart3,
  Library,
  type LucideIcon,
} from "lucide-react";
import { useAppStore, type TabKey } from "@/store/useAppStore";
import { useRunStore } from "@/store/useRunStore";
import { cn } from "@/lib/utils";

const TABS: { key: TabKey; icon: LucideIcon }[] = [
  { key: "datasets", icon: Database },
  { key: "providers", icon: Server },
  { key: "optimize", icon: Sparkles },
  { key: "evaluate", icon: BarChart3 },
  { key: "prompts", icon: Library },
];

export function TabNav() {
  const { t } = useTranslation();
  const { activeTab, setActiveTab } = useAppStore();
  // 运行状态：在其他 Tab 也能看到优化任务是否在跑
  const runStatus = useRunStore((s) => s.status);
  const currentRound = useRunStore((s) => s.currentRound);
  const totalRounds = useRunStore((s) => s.totalRounds);

  return (
    <nav className="flex shrink-0 items-center gap-1 border-b bg-card px-2">
      {TABS.map(({ key, icon: Icon }) => {
        const isActive = activeTab === key;
        const isOptimize = key === "optimize";
        const isRunning = isOptimize && runStatus === "running";
        return (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "relative flex h-10 items-center gap-1.5 px-3 text-sm font-medium transition-colors",
              isActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {t(`tabs.${key}`)}
            {/* 运行中：小绿点 + 脉动 */}
            {isRunning && (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
            )}
            {/* 运行中且不在本页：显示轮次徽章 */}
            {isRunning && !isActive && totalRounds > 0 && (
              <span className="ml-0.5 rounded bg-success px-1 text-[10px] font-medium leading-4 text-success-foreground">
                {currentRound}/{totalRounds}
              </span>
            )}
            {isActive && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
