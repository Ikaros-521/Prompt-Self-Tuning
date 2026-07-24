// 一次性图标生成脚本：把 public/favicon.svg 光栅化为 build/icon.png（1024×1024）
// 用法：npm run icon
// 产物需提交进仓库，使 CI 在无需安装 sharp 的情况下也能打包。

import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const svgPath = path.join(root, "public", "favicon.svg");
const outDir = path.join(root, "build");
const outPng = path.join(outDir, "icon.png");

const SIZE = 1024;

await mkdir(outDir, { recursive: true });

// sharp 读取 svg 字符串并以指定密度渲染，避免默认低分辨率锯齿
await sharp(svgPath, { density: 384 })
  .resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(outPng);

console.log(`✓ 图标已生成: ${path.relative(root, outPng)} (${SIZE}×${SIZE})`);
console.log("  请将 build/icon.png 提交到仓库（CI 打包依赖此文件）。");
