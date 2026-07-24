// Electron 预加载脚本
// 运行在渲染进程可访问的隔离上下文中，通过 contextBridge 暴露极少的只读信息。
// 不暴露任何 Node / Electron 能力，保证渲染层无法直接访问文件系统或主进程 API。

const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("electronApp", {
  // 供"关于"等界面显示，无敏感信息
  version: process.env.npm_package_version || "0.0.0",
  platform: process.platform,
  isElectron: true,
});
