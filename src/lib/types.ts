/** 全局类型定义 */

/** LLM 供应商配置（OpenAI 兼容） */
export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  isDefault?: boolean;
  createdAt: number;
}

/** 单条训练样本 */
export interface Sample {
  input: string;
  /** 可选上下文（背景资料、文档片段等） */
  context?: string;
  /** 期望输出（标准答案） */
  expected: string;
}

/** 数据集格式 */
export type DatasetFormat = "jsonl" | "json" | "txt";

/** 数据集 */
export interface Dataset {
  id: string;
  name: string;
  format: DatasetFormat;
  samples: Sample[];
  /** 原始文本，便于回溯 */
  raw: string;
  createdAt: number;
}

/** 提示词版本状态 */
export type PromptVersionStatus = "adopted" | "discarded" | "baseline";

/** 提示词版本（版本库） */
export interface PromptVersion {
  id: string;
  datasetId: string;
  content: string;
  /** 版本号 */
  version: number;
  /** 产生该版本的轮次 */
  round: number;
  /** dev set 平均分 */
  score: number;
  /** 父版本 id（版本链） */
  parentId?: string;
  /** 本版改动说明 */
  changes: string[];
  status: PromptVersionStatus;
  runId?: string;
  createdAt: number;
}

/** 单条样本的评估结果 */
export interface CaseResult {
  index: number;
  input: string;
  context?: string;
  expected: string;
  actual: string;
  /** 0-1 */
  score: number;
  /** 格式是否通过 */
  formatPassed: boolean;
  /** LLM judge 给出的原因 */
  reason?: string;
  /** 失败维度 */
  failedDimensions?: string[];
  /** 是否通过（达到阈值） */
  passed: boolean;
}

/** 一轮优化的完整记录 */
export interface RoundRecord {
  round: number;
  /** 本轮测试用的 prompt 快照 */
  promptSnapshot: string;
  /** 测试用样本 index（train minibatch） */
  sampledIndices: number[];
  /** train minibatch 的逐条结果 */
  results: CaseResult[];
  /** train minibatch 平均分 */
  avgScore: number;
  /** dev set 全量平均分（用于选优） */
  devScore: number;
  /** critic 反思分析 */
  reflectAnalysis?: string;
  /** 改写说明 */
  changes?: string[];
  /** 改写后的新 prompt */
  newPrompt?: string;
  /** 新版本是否被采纳 */
  adopted?: boolean;
  /** 本轮耗时 ms */
  duration: number;
  /** token 估算 */
  tokensEstimate: number;
}

/** 运行状态 */
export type RunStatus = "running" | "done" | "stopped" | "error";

/** 优化运行配置 */
export interface OptimizeConfig {
  datasetId: string;
  providerId: string;
  /** judge 用的供应商（可选，默认同 providerId） */
  judgeProviderId?: string;
  /** 最大轮数 */
  maxRounds: number;
  /** 每轮训练采样数 */
  sampleSize: number;
  /** 执行模型温度 */
  executorTemperature: number;
  /** 达到此阈值自动停止并存档 */
  scoreThreshold: number;
  /** 连续 N 轮无提升则收敛停止 */
  convergenceRounds: number;
  /** train/dev 划分比例（train 占比） */
  trainRatio: number;
  /** 是否允许 agent 自主判断停止 */
  agentAutoStop: boolean;
  /** 用户直接提供的初版提示词（非空则跳过自动生成，直接用作种子） */
  initialPrompt?: string;
  /** 用户的需求描述/写作意图（作为背景引导 seed agent 生成） */
  userGuidance?: string;
}

/** 一次完整优化运行 */
export interface Run {
  id: string;
  datasetId: string;
  providerId: string;
  config: OptimizeConfig;
  status: RunStatus;
  rounds: RoundRecord[];
  /** 当前轮次 */
  currentRound: number;
  /** 历史最高 dev 分 */
  bestScore: number;
  bestVersionId?: string;
  /** 当前生效 prompt（最新被采纳的） */
  currentPrompt?: string;
  errorMessage?: string;
  startedAt: number;
  endedAt?: number;
}

/** LLM 聊天消息 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** LLM 调用参数 */
export interface ChatParams {
  provider: Provider;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  signal?: AbortSignal;
}

/** 优化引擎对外抛出的进度事件（异步 generator yield） */
export type OptimizerEvent =
  | { type: "init"; message: string }
  | {
      type: "seed";
      prompt: string;
      baselineScore: number;
      /** 种子来源 */
      source: "user" | "guided" | "auto";
    }
  | { type: "round_start"; round: number; totalRounds: number }
  | { type: "sampled"; indices: number[] }
  | { type: "testing"; index: number; total: number }
  | { type: "case_done"; result: CaseResult }
  | { type: "round_scored"; avgScore: number; devScore: number }
  | { type: "reflecting"; analysis?: string }
  | { type: "rewriting"; newPrompt?: string; changes?: string[] }
  | { type: "validated"; adopted: boolean; devScore: number }
  | { type: "agent_decision"; shouldStop: boolean; reason: string }
  | { type: "round_end"; round: number; roundRecord: RoundRecord }
  | { type: "info"; message: string }
  | { type: "warn"; message: string }
  | { type: "error"; message: string }
  | {
      type: "done";
      bestScore: number;
      bestVersionId?: string;
      reason: string;
      /** 最终采用的版本（含 baseline），供调用方存档 */
      versions: PromptVersion[];
      /** 累计 token 估算 */
      totalTokens: number;
      /** 最终生效 prompt */
      finalPrompt: string;
    };
