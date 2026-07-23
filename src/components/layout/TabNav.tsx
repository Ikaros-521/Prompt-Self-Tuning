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

  return (
    <nav className="flex shrink-0 items-center gap-1 border-b bg-card px-2">
      {TABS.map(({ key, icon: Icon }) => (
        <button
          key={key}
          onClick={() => setActiveTab(key)}
          className={cn(
            "relative flex h-10 items-center gap-1.5 px-3 text-sm font-medium transition-colors",
            activeTab === key
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
          {t(`tabs.${key}`)}
          {activeTab === key && (
            <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
          )}
        </button>
      ))}
    </nav>
  );
}
