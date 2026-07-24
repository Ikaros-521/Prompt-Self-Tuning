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
    // v3: 去掉 providers 的 isDefault 索引——布尔值不是合法的 IndexedDB 索引键，
    // 以 where("isDefault") 查询会在构建 IDBKeyRange 时抛 DataError。
    // getDefaultProvider 改为内存筛选，provider 数量很小，无性能影响。
    // 注意：Dexie 升级时只保留本版本声明过的表，未声明的表会被删除！
    // 因此必须把所有表都重新声明一遍，仅 providers 这一行有改动。
    this.version(3).stores({
      datasets: "id, name, createdAt",
      providers: "id, name, createdAt",
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
  // isDefault 为布尔值，不能作为 IndexedDB 索引键（参见 schema v3 注释）。
  // 这里用 createdAt 索引拉取有序列表后内存筛选，provider 数量小，开销可忽略。
  const list = await db.providers.orderBy("createdAt").toArray();
  return list.find((p) => p.isDefault) ?? list[0];
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
