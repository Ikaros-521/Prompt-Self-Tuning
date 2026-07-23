import { create } from "zustand";

export type TabKey =
  | "datasets"
  | "providers"
  | "optimize"
  | "evaluate"
  | "prompts";

export type ThemeMode = "light" | "dark";

interface AppState {
  /** 当前激活的 tab */
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;

  /** 主题 */
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;

  /** 当前选中的数据集 / 供应商（跨 tab 联动方便） */
  selectedDatasetId: string | null;
  selectedProviderId: string | null;
  setSelectedDataset: (id: string | null) => void;
  setSelectedProvider: (id: string | null) => void;
}

const THEME_KEY = "pst.theme";

function detectInitialTheme(): ThemeMode {
  const saved = localStorage.getItem(THEME_KEY) as ThemeMode | null;
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export const useAppStore = create<AppState>((set, get) => ({
  activeTab: "optimize",
  setTheme: (theme) => {
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next = get().theme === "dark" ? "light" : "dark";
    get().setTheme(next);
  },
  setActiveTab: (activeTab) => set({ activeTab }),

  selectedDatasetId: null,
  selectedProviderId: null,
  setSelectedDataset: (selectedDatasetId) => set({ selectedDatasetId }),
  setSelectedProvider: (selectedProviderId) => set({ selectedProviderId }),
  theme: detectInitialTheme(),
}));

/** 在 app 启动时调用，同步初始主题到 DOM */
export function initTheme() {
  applyTheme(detectInitialTheme());
}
