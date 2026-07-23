import Dexie, { type Table } from "dexie";
import type {
  ChatSession,
  Dataset,
  Provider,
  PromptVersion,
  Run,
} from "./types";

/**
 * 应用主数据库（IndexedDB via Dexie）
 *
 * 表说明：
 * - datasets:       导入的训练数据集
 * - providers:      LLM 供应商配置
 * - promptVersions: 提示词版本库（核心，版本链可回滚）
 * - runs:           每次优化运行的完整记录
 * - chatSessions:   测试页的对话会话（v2 新增）
 */
export class AppDB extends Dexie {
  datasets!: Table<Dataset, string>;
  providers!: Table<Provider, string>;
  promptVersions!: Table<PromptVersion, string>;
  runs!: Table<Run, string>;
  chatSessions!: Table<ChatSession, string>;

  constructor() {
    super("prompt-self-tuning");
    this.version(1).stores({
      datasets: "id, name, createdAt",
      providers: "id, name, isDefault, createdAt",
      promptVersions: "id, datasetId, version, score, status, createdAt",
      runs: "id, datasetId, providerId, status, startedAt",
    });
    // v2: 新增 chatSessions 表（测试页对话历史）。声明全部表，仅 chatSessions 是新增。
    this.version(2).stores({
      datasets: "id, name, createdAt",
      providers: "id, name, isDefault, createdAt",
      promptVersions: "id, datasetId, version, score, status, createdAt",
      runs: "id, datasetId, providerId, status, startedAt",
      chatSessions: "id, providerId, createdAt",
    });
  }
}

export const db = new AppDB();

/* ---------------- 便捷封装 ---------------- */

/** 获取默认 provider，若无则取第一个 */
export async function getDefaultProvider(): Promise<Provider | undefined> {
  const def = await db.providers.where("isDefault").equals(1 as never).first();
  if (def) return def;
  return db.providers.orderBy("createdAt").first();
}

/** 设为默认（其余取消） */
export async function setDefaultProvider(id: string): Promise<void> {
  await db.transaction("rw", db.providers, async () => {
    const all = await db.providers.toArray();
    for (const p of all) {
      await db.providers.update(p.id, { isDefault: p.id === id });
    }
  });
}

/** 获取某数据集的提示词版本（按分数降序） */
export async function getVersionsByDataset(
  datasetId: string,
): Promise<PromptVersion[]> {
  const list = await db.promptVersions
    .where("datasetId")
    .equals(datasetId)
    .toArray();
  return list.sort((a, b) => b.score - a.score);
}
