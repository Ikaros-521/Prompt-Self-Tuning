# 提示词自优化 · Prompt Self-Tuning

在线体验：[https://ikaros-521.github.io/Prompt-Self-Tuning/](https://ikaros-521.github.io/Prompt-Self-Tuning/)

一个**纯前端**的 LLM 提示词自动优化工具。导入你的训练集（输入 + 期望输出），由一个 AI agent 自动迭代优化 system prompt——逐轮**采样 → 测试 → 评分 → 反思 → 改写 → 验证选优**，直到达到阈值或收敛，并把每个版本存档供后期对比。

界面风格参考 [LLaMA Factory](https://github.com/hiyouga/LlamaFactory) WebUI：紧凑工程表单 + 左日志右曲线双栏 + 折叠面板。

> 不上 Python / FastAPI 后端。浏览器直连你配置的 OpenAI 兼容端点，数据全部存在本地浏览器（IndexedDB）。

---

## ✨ 特性

- **自动优化循环**：种子撰写 → 迭代反思改写，GEPA 工程简化版算法
- **初版提示词三种来源**：留空自动生成 / 直接粘贴现成提示词 / 描述需求引导生成；另有 **引导式多轮对话**与 AI 逐步明确需求后产出初版
- **多停止条件**：最大轮数 / 评分阈值 / 连续收敛检测 / agent 自主判断 / 手动停止
- **防退化**：新版本必须在验证集上严格优于当前最优才采纳，保留版本链可回滚
- **标准两档评分**：格式硬过滤（L1）+ LLM-as-Judge（L3，rubric + reason，temperature=0）
- **版本库**：所有提示词版本按分数排序，查看内容 / 导出 JSON·TXT / 对比评估
- **数据集**：支持 JSONL / JSON / TXT 三格式自动识别，支持上下文字段
- **供应商**：OpenAI 兼容统一配置（base_url + api_key + model），预设 OpenRouter / DeepSeek / OpenAI / 自定义
- **中英双语** + **暗色主题**

---

## 🚀 快速开始

```bash
npm install
npm run dev      # 启动开发服务器 http://localhost:55573
npm run build    # 生产构建
npm run preview  # 预览构建产物
```

> Node ≥ 18（推荐 22）。

### 三步上手

1. **数据集** Tab → 新增 → 粘贴或拖入训练集，确认解析后保存
2. **供应商** Tab → 新增 → 填 base_url / api_key / model，点「测试连接」
3. **优化** Tab → 选数据集与供应商 → 调整轮数/阈值 → 「开始优化」

优化完成后，去 **评估** Tab 对比各版本效果，或在 **提示词库** 导出最佳版本。

---

## 🌐 部署到 GitHub Pages

本项目是**纯前端**应用（无后端、数据存浏览器 IndexedDB），完美适配 GitHub Pages 的静态托管。仓库已内置 GitHub Actions 自动部署工作流（`.github/workflows/deploy.yml`）。

### 一次性配置

1. 把仓库推到 GitHub（假设仓库名为 `Prompt-Self-Tuning`）
2. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **"GitHub Actions"**
3. 推送代码到 `main` 分支即可自动构建部署

部署后访问 `https://<你的用户名>.github.io/Prompt-Self-Tuning/`

### 子路径原理

GitHub Pages 项目页带仓库名子路径（`.../Prompt-Self-Tuning/`）。本项目通过环境变量 `BASE_PATH` 自动适配：

- 本地 `npm run dev` / 默认构建：`base = /`（根路径）
- CI 构建：`BASE_PATH=/<仓库名>/`，由工作流用 `${{ github.event.repository.name }}` 自动注入

**改仓库名无需改代码**——工作流会自动取新仓库名。

### 手动本地预览 Pages 构建产物

```bash
# Git Bash 用户加 MSYS_NO_PATHCONV=1 避免路径被转换
MSYS_NO_PATHCONV=1 BASE_PATH="/你的仓库名/" npm run build
npm run preview   # 预览带子路径的构建产物
```

### 其他部署方式

- **用户页**（`<用户名>.github.io` 仓库，根路径）：无需配 `BASE_PATH`，默认 `/` 即可
- **自定义域名**：在 Pages 设置里绑定域名，同样无需改 `BASE_PATH`
- **任何静态托管**（Vercel/Netlify/Cloudflare Pages）：直接部署，默认根路径

### 三步上手

1. **数据集** Tab → 新增 → 粘贴或拖入训练集，确认解析后保存
2. **供应商** Tab → 新增 → 填 base_url / api_key / model，点「测试连接」
3. **优化** Tab → 选数据集与供应商 → 调整轮数/阈值 → 「开始优化」

优化完成后，去 **评估** Tab 对比各版本效果，或在 **提示词库** 导出最佳版本。

---

## 🖥️ 桌面应用打包（Electron）

本项目同时提供 **Electron 桌面版**，可打包成 Windows（`.exe`）、macOS（`.dmg`）、Linux（`.AppImage`/`.deb`）原生应用，数据同样存本地（IndexedDB）。

### 本地开发调试

```bash
npm install
npm run electron:dev   # 同时起 Vite dev server 和 Electron 窗口，支持热更新
```

### 本地打包

```bash
npm run electron:build
```

产物输出到 `out/` 目录。在 Windows 上会得到：
- `Prompt-Self-Tuning Setup x.x.x.exe` — NSIS 安装器（可选安装路径、创建快捷方式）
- `prompt-self-tuning-x.x.x-win.zip` — 绿色免安装版

> ⚠️ **跨平台限制**：Electron 二进制必须在对应操作系统上构建。本地只能在当前平台打包；要产出 macOS / Linux 安装包，请用下方 CI 方案。

### 全平台发布（GitHub Actions）

仓库已内置 `.github/workflows/release.yml`，在 **Windows / macOS / Linux** 三平台并行构建：

- **打 tag 自动发布**：推送形如 `v0.1.0` 的 tag，CI 会自动构建并发布到 GitHub Release。
- **手动构建**：在仓库 **Actions** 页面手动触发 `Release Desktop App`，产物作为 artifact 上传（不发布 Release）。

```bash
git tag v0.1.0
git push origin v0.1.0   # 触发 CI 全平台构建并发布
```

### 关于 CORS（桌面版 vs 网页版）

- **网页版**：浏览器直连 LLM 端点，端点**必须支持 CORS**（详见下文）。
- **桌面版**：Electron 渲染层仍走浏览器网络栈，所以同样建议端点支持 CORS；但本地 Ollama（`http://localhost:11434`）等自部署服务在桌面版下调用更顺，CORS 容错更好。

### macOS 签名说明

默认**不签名**。未签名的 `.dmg` 首次打开会被 Gatekeeper 拦截，可右键 →「打开」放行。如需正式签名与公证，在仓库 Secrets 配置证书信息并启用 `release.yml` 中注释掉的环境变量（`CSC_LINK` / `APPLE_ID` 等）。

### 替换应用图标

应用图标由 `build/icon.png`（1024×1024）生成。替换方法：

```bash
# 用自带的 favicon.svg 重新生成
npm run icon

# 或直接把自己的 1024×1024 PNG 覆盖 build/icon.png
```

electron-builder 会在各平台自动从这张 PNG 生成 `.ico`（Windows）/ `.icns`（macOS）。

---

## 🔌 供应商配置（重要：CORS）

本工具由浏览器**直接调用** LLM 端点，因此该端点**必须支持 CORS**。

| 端点 | 浏览器直连 | 说明 |
|---|---|---|
| **OpenRouter** | ✅ 推荐 | 原生支持 CORS，开箱即用 |
| DeepSeek | ✅ | OpenAI 兼容 |
| Anthropic | ✅ | 已开启 CORS |
| OpenAI 官方 | ⚠️ 不稳定 | 官方在收紧浏览器直连，可能报 CORS |
| 自部署 one-api / new-api | ⚠️ | 需同源反代或改代码加 CORS 中间件 |
| LiteLLM Proxy | ⚠️ | 在 `config.yaml` 配 `allowed_origins` |

配置字段统一为：`Base URL` + `API Key` + `Model`。

### 🔐 安全说明（BYOK）

API Key 仅存储在你**本地浏览器的 IndexedDB** 中，明文可见。请勿在公共/共享设备上保存密钥。本工具不硬编码、不上传任何密钥，责任由用户自负。建议配合导出 JSON 功能做好备份。

---

## 📊 数据集格式

### JSONL（每行一个对象）

```jsonl
{"input": "翻译：hello", "expected": "你好"}
{"input": "翻译：world", "expected": "世界", "context": "英译中"}
```

字段名兼容多种写法：`input`/`question`/`prompt`/`q`、`expected`/`answer`/`output`/`a`、`context`/`background`/`ctx`（可选）。

### JSON（数组）

```json
[
  { "input": "...", "expected": "..." },
  { "input": "...", "expected": "..." }
]
```

### TXT（逐行/逐块，分隔符分隔问答）

```
翻译：hello => 你好
翻译：world => 世界
```

默认自动探测分隔符（`=>`、`|`、`:`、`---` 等），也可在导入界面手动指定。也支持 `Q:/A:` 标记风格和多块（空行分隔）。

---

## 🧠 优化原理

每轮循环：

1. **采样**：从训练集抽一个 minibatch（默认 8 条）
2. **测试**：用当前 prompt 在 minibatch 上调用 LLM
3. **评分（标准两档）**：
   - L1 格式硬过滤：精确匹配 / JSON 结构 / 代码块校验——不过关直接 0 分，节省 judge 调用
   - L3 LLM-as-Judge：rubric 拆成离散维度（正确性/完整性/格式/简洁性），固定 `temperature=0`，输出 `{score, reason, failedDimensions}`
4. **反思**：独立 critic agent 分析失败模式，归因到 prompt 的具体表述（executor/critic 分离，防自我合理化）
5. **改写**：prompt-engineer agent 产出**针对性 delta**（保留有效部分，不推倒重写）
6. **验证选优**：新 prompt 在**验证集**全量跑，严格优于当前最优才采纳并存档

### 种子提示词（初始版本）

优化前需要一条"种子"作为起点。支持三种来源（在「优化」页的「初版提示词（可选）」折叠区配置）：

| 模式 | 行为 | 适用场景 |
|---|---|---|
| 自动生成 | agent 按数据集抽样自动撰写 | 完全从零开始 |
| 粘贴提示词 | 直接把你的现成 prompt 当种子，**跳过自动生成** | 已有初版，想自动优化它 |
| 描述需求 | 把你的需求描述喂给 agent，引导它生成 | 有明确需求但不想自己写 prompt |

此外还有 **引导式多轮对话**（点「✨ 引导式生成初版」）：与 AI 逐步明确任务类型、输入输出格式、语气、约束，确认后产出基础提示词，再进入自动优化循环。对话有 8 轮上限防卡死，可随时确认或重新开始。

**训练/验证划分**（默认 80/20）：训练集用于反思改写，验证集用于选优，避免过拟合。

**停止条件**（可组合）：最大轮数 / dev 分达阈值 / 连续 N 轮无提升（收敛）/ agent 自主判断 / 用户手动停止。

---

## 🏗️ 架构

```
src/
├── lib/
│   ├── types.ts        # 全局类型
│   ├── db.ts           # Dexie (IndexedDB): datasets / providers / promptVersions / runs
│   ├── llm.ts          # chat() 非流式 + streamChat() fetch+SSE+AbortController
│   ├── parser.ts       # 数据集解析（jsonl/json/txt 自动识别）
│   ├── scoring.ts      # 格式过滤 + LLM judge 组合评分
│   ├── metaPrompts.ts  # 种子/反思/改写/judge/决策 模板
│   ├── optimizer.ts    # 优化引擎（异步 generator，逐步 yield 事件）
│   └── evaluate.ts     # 评估（全量跑 + 汇总）
├── hooks/useOptimizer.ts  # 引擎 ↔ UI 桥接（日志/状态/取消/存档）
├── store/useAppStore.ts   # Zustand: tab/主题/选中项
├── i18n/                  # 中英双语
└── components/
    ├── ui/             # shadcn/ui 基础组件
    ├── layout/         # Header / TabNav
    ├── datasets/       # 数据集导入 + 预览
    ├── providers/      # 供应商表单 + 测试连接
    ├── optimize/       # 配置 + 实时日志 + 评分曲线 + 指标卡
    ├── evaluate/       # 版本对比评估
    └── prompts/        # 提示词版本库
```

**技术栈**：Vite + React 18 + TypeScript + shadcn/ui (Radix) + Tailwind + Zustand + Dexie + react-i18next + recharts。

---

## ❓ 常见问题

**Q：为什么连不上模型，报 CORS 错误？**
A：浏览器直连要求端点开启 CORS。换用 OpenRouter，或给自部署网关加 CORS / 同源反代。

**Q：数据会丢吗？**
A：存在浏览器 IndexedDB，清缓存/换设备会丢。请在「数据集」和「提示词库」页用导出功能备份。启动时已申请持久化存储以降低被清理概率。

**Q：流式输出怎么实现的？**
A：`chat/completions` 是 POST，不能用原生 `EventSource`，所以手写 `fetch` + `ReadableStream` 解析 SSE，并用 `TextDecoder({stream:true})` 处理 UTF-8 边界，`AbortController` 支持取消。

**Q：评分准不准？**
A：judge 固定 `temperature=0` 提升稳定性，rubric 拆成离散维度、要求输出 reason。建议用比执行模型更强的模型做 judge（可在「高级设置」单独配置 judge 供应商）。

---

## 📄 License

MIT
