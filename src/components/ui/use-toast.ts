import { create } from "zustand";
import { uid } from "@/lib/utils";

export type ToastVariant = "default" | "destructive" | "success";

export interface ToastItem {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastStore {
  toasts: ToastItem[];
  push: (t: Omit<ToastItem, "id">) => string;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => {
    const id = uid("toast");
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    return id;
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** 命令式调用 */
export const toast = {
  show: (t: Omit<ToastItem, "id">) => useToastStore.getState().push(t),
  success: (description: string, title?: string) =>
    useToastStore
      .getState()
      .push({ description, title, variant: "success", duration: 3000 }),
  error: (description: string, title?: string) =>
    useToastStore
      .getState()
      .push({ description, title, variant: "destructive", duration: 5000 }),
  info: (description: string, title?: string) =>
    useToastStore.getState().push({ description, title, duration: 3000 }),
};

/** 渲染所有 toast 的容器组件（放到 App 根） */
export { ToastViewport } from "./toast";
