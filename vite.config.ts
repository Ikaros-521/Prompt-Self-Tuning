import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// GitHub Pages 子路径适配：
// - 本地 dev / 普通构建：base = "/"（根路径，正常）
// - 部署到 GitHub Pages 项目页（带仓库名子路径）时，
//   CI 通过环境变量 BASE_PATH 注入，如 "/Prompt-Self-Tuning/"
const base = process.env.BASE_PATH || "/";

// https://vite.dev/config/
export default defineConfig({
  // 让所有资源引用都带上 base 前缀，避免在子路径下 404
  base,
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 55573,
    open: true,
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          recharts: ["recharts"],
          radix: [
            "@radix-ui/react-accordion",
            "@radix-ui/react-dialog",
            "@radix-ui/react-select",
            "@radix-ui/react-slider",
            "@radix-ui/react-tabs",
            "@radix-ui/react-toast",
            "@radix-ui/react-tooltip",
          ],
        },
      },
    },
  },
});
