// Electron 主进程
// 入口由 package.json 的 "main" 字段指向。
// 使用 CommonJS（.cjs）以规避项目 package.json 中 "type":"module" 的 ESM 兼容问题。

const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");

// 是否为开发态（通过 ELECTRON_DEV 环境变量注入，见 package.json scripts）
const isDev = !!process.env.ELECTRON_DEV;

/**
 * 创建应用主窗口。
 * 安全策略：contextIsolation 开启、nodeIntegration 关闭、sandbox 开启。
 */
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Prompt Self-Tuning",
    // 窗口图标：从 build/icon.png 读取；缺失时各平台使用默认图标。
    icon: path.join(__dirname, "..", "build", "icon.png"),
    // 暗色标题栏更贴合应用主题；让窗口背景与深色 UI 无缝衔接
    backgroundColor: "#0a0a0a",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // 安全 CSP（仅生产模式）：默认只允许同源资源，但放开 connect-src 以便调用
  // 用户配置的 LLM API（包括本地 Ollama 这类 http://localhost 服务）。
  // dev 模式下加载 localhost 的 Vite dev server，其 HMR/React Refresh 依赖
  // inline script，严格的 CSP 会导致黑屏，故 dev 模式不设 CSP。
  if (!isDev) {
    win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src 'self'; " +
              "img-src 'self' data: blob: https:; " +
              "style-src 'self' 'unsafe-inline'; " +
              "script-src 'self'; " +
              // 允许任意 https/http 的接口调用（外部 LLM + 本地模型服务）
              "connect-src 'self' https: http: ws: wss:; " +
              "font-src 'self' data:; " +
              "worker-src 'self' blob:;",
          ],
        },
      });
    });
  }

  // 外部链接用系统浏览器打开，而不是在 Electron 内新开窗口
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    // 开发态：加载 Vite dev server，并打开 DevTools
    // 端口与 package.json 的 electron:dev 脚本约定一致（默认 55573），
    // 可通过 VITE_PORT 环境变量覆盖。
    const devPort = process.env.VITE_PORT || "55573";
    win.loadURL(`http://localhost:${devPort}`);
    win.webContents.openDevTools();
  } else {
    // 生产态：加载构建产物。Vite 构建时 base:"./"，资源为相对路径，file:// 可正确解析。
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

// Electron 就绪后创建窗口
app.whenReady().then(() => {
  createWindow();

  // macOS：点击 Dock 图标且没有窗口时，重新创建一个
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 所有窗口关闭时退出应用（macOS 除外，Mac 上应用保持活动状态直到显式退出）
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
