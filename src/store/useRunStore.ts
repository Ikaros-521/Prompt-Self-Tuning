import { create } from "zustand";
import type { TFunction } from "i18next";
import { runOptimization } from "@/lib/optimizer";
import { db } from "@/lib/db";
import { uid } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import type {
  CaseResult,
  Dataset,
  OptimizeConfig,
  OptimizerEvent,
  Provider,
  PromptVersion,
  Run,
  RoundRecord,
} from "@/lib/types";

export interface LogLine {
  id: string;
  text: string;
  level: "info" | "success" | "warn" | "error";
  ts: number;
}

export interface ChartPoint {
  round: number;
  train: number;
  dev: number;
}

export interface RunState {
  status: "idle" | "running" | "done" | "stopped" | "error";
  logs: LogLine[];
  chart: ChartPoint[];
  currentRound: number;
  totalRounds: number;
  currentPrompt: string;
  bestScore: number;
  currentScore: number;
  tokens: number;
  results: CaseResult[];
  lastRound?: RoundRecord;
  runId?: string;
  errorMessage?: string;
}

const INITIAL: RunState = {
  status: "idle",
  logs: [],
  chart: [],
  currentRound: 0,
  totalRounds: 0,
  currentPrompt: "",
  bestScore: 0,
  currentScore: 0,
  tokens: 0,
  results: [],
};

/**
 * 全局优化运行 store。
 *
 * 把运行状态从组件局部提升到模块级全局：
 * 优化循环在 start() 内用 for await 消费 generator，脱离任何组件生命周期。
 * 切 Tab 只是卸载/挂载 UI，后台循环照常跑，切回来从 store 读快照恢复。
 */
interface RunStore extends RunState {
  /** i18n 的 t 函数（由 App 顶层注入，store 不能用 useTranslation hook） */
  start: (
    dataset: Dataset,
    executor: Provider,
    judge: Provider,
    config: OptimizeConfig,
  ) => Promise<void>;
  stop: () => void;
  reset: () => void;
}

// 模块级（非 React state）：i18n 函数 + abort 控制器 + 运行中的 runId
let tRef: TFunction | null = null;
let abortController: AbortController | null = null;

export function setT(t: TFunction) {
  tRef = t;
}
const T = () => tRef;

// 安全调用 t：未注入时退化为返回 key
function tr(key: string, opts?: Record<string, unknown>): string {
  const t = T();
  if (!t) return key;
  return t(key, opts as never) as unknown as string;
}

export const useRunStore = create<RunStore>((set, get) => {
  /** 追加一条日志（限 500 条） */
  const addLog = (text: string, level: LogLine["level"] = "info") => {
    set((s) => ({
      logs: [
        ...s.logs,
        { id: uid("log"), text, level, ts: Date.now() },
      ].slice(-500),
    }));
  };

  /** 把事件应用到快照 */
  const applyEvent = (ev: OptimizerEvent) => {
    switch (ev.type) {
      case "init":
        addLog(tr("log.init", { message: ev.message }));
        break;
      case "info":
        addLog(ev.message);
        break;
      case "warn":
        addLog(ev.message, "warn");
        break;
      case "error":
        addLog(ev.message, "error");
        set({ status: "error", errorMessage: ev.message });
        break;
      case "seed":
        addLog(
          tr("log.seed", {
            score: ev.baselineScore.toFixed(3),
            source: tr(`optimize.seedSource.${ev.source}`),
          }),
          "success",
        );
        set({
          currentPrompt: ev.prompt,
          currentScore: ev.baselineScore,
          bestScore: ev.baselineScore,
        });
        break;
      case "round_start":
        addLog(
          tr("log.roundStart", { round: ev.round, total: ev.totalRounds }),
        );
        set({ currentRound: ev.round, results: [] });
        break;
      case "sampled":
        addLog(tr("log.sampled", { count: ev.indices.length }));
        break;
      case "testing":
        // 高频，不写日志
        break;
      case "case_done": {
        const flag = ev.result.formatPassed
          ? ev.result.passed
            ? "✓"
            : "·"
          : "✗";
        addLog(
          tr("log.caseDone", {
            index: ev.result.index + 1,
            score: ev.result.score.toFixed(2),
            flag,
          }),
          ev.result.passed ? "success" : "warn",
        );
        set((s) => ({ results: [...s.results, ev.result] }));
        break;
      }
      case "round_scored":
        addLog(
          tr("log.roundScored", {
            train: ev.avgScore.toFixed(3),
            dev: ev.devScore.toFixed(3),
          }),
        );
        set((s) => ({
          currentScore: ev.avgScore,
          chart: [
            ...s.chart,
            { round: s.currentRound, train: ev.avgScore, dev: ev.devScore },
          ],
        }));
        break;
      case "reflecting":
        if (ev.analysis) addLog(`${tr("log.reflecting")} ${ev.analysis}`);
        else addLog(tr("log.reflecting"));
        break;
      case "rewriting":
        if (ev.newPrompt) {
          addLog(tr("log.rewriting"), "success");
          if (ev.changes?.length) {
            for (const c of ev.changes) addLog(`  · ${c}`);
          }
        } else {
          addLog(tr("log.rewriting"));
        }
        break;
      case "validated":
        addLog(
          tr("log.validated", {
            dev: ev.devScore.toFixed(3),
            result: ev.adopted ? "✓ 采纳" : "× 丢弃",
          }),
          ev.adopted ? "success" : "warn",
        );
        break;
      case "agent_decision":
        addLog(
          tr("log.agentDecision", {
            decision: ev.shouldStop ? "停止" : "继续",
            reason: ev.reason,
          }),
        );
        break;
      case "round_end":
        set({ lastRound: ev.roundRecord });
        break;
      case "done":
        finalDone(ev);
        break;
    }
  };

  const finalDone = (ev: Extract<OptimizerEvent, { type: "done" }>) => {
    let status: RunState["status"] = "done";
    let level: LogLine["level"] = "success";
    let msg = tr("optimize.done", { score: ev.bestScore.toFixed(3) });
    if (ev.reason === "stopped") {
      status = "stopped";
      level = "warn";
      msg = tr("optimize.stopped");
    } else if (ev.reason === "error") {
      status = "error";
      level = "error";
    }
    addLog(msg, level);
    set((s) => ({
      status,
      bestScore: ev.bestScore,
      currentPrompt: ev.finalPrompt || s.currentPrompt,
      tokens: ev.totalTokens,
    }));
  };

  /** 持久化结果到 IndexedDB */
  const persistResults = async (
    runId: string,
    dataset: Dataset,
    ev: Extract<OptimizerEvent, { type: "done" }>,
  ) => {
    try {
      const existing = await db.promptVersions
        .where("datasetId")
        .equals(dataset.id)
        .toArray();
      const existingContents = new Set(existing.map((v) => v.content));
      const toAdd = ev.versions.filter(
        (v: PromptVersion) => !existingContents.has(v.content),
      );
      if (toAdd.length) await db.promptVersions.bulkAdd(toAdd);

      const statusMap: Record<string, Run["status"]> = {
        threshold: "done",
        converged: "done",
        max_rounds: "done",
        agent: "done",
        stopped: "stopped",
        error: "error",
      };
      await db.runs.update(runId, {
        status: statusMap[ev.reason] ?? "done",
        bestScore: ev.bestScore,
        bestVersionId: ev.bestVersionId,
        currentPrompt: ev.finalPrompt,
        endedAt: Date.now(),
      });

      if (ev.reason !== "error" && ev.reason !== "stopped") {
        toast.success(tr("optimize.done", { score: ev.bestScore.toFixed(3) }));
      }
    } catch (e) {
      addLog(
        `存档失败：${e instanceof Error ? e.message : String(e)}`,
        "error",
      );
    }
  };

  return {
    ...INITIAL,

    start: async (dataset, executor, judge, config) => {
      // 防重复启动
      if (get().status === "running") return;

      const controller = new AbortController();
      abortController = controller;
      const runId = uid("run");

      set({
        ...INITIAL,
        status: "running",
        runId,
        totalRounds: config.maxRounds,
      });

      const run: Run = {
        id: runId,
        datasetId: dataset.id,
        providerId: executor.id,
        config,
        status: "running",
        rounds: [],
        currentRound: 0,
        bestScore: 0,
        startedAt: Date.now(),
      };
      await db.runs.put(run);

      const gen = runOptimization({
        dataset,
        executor,
        judge,
        config,
        signal: controller.signal,
      });

      let finalEvent: Extract<OptimizerEvent, { type: "done" }> | null = null;

      try {
        // 核心循环：在 store action 内消费 generator，脱离组件生命周期
        for await (const ev of gen) {
          applyEvent(ev);
          if (ev.type === "done") finalEvent = ev;
        }
      } catch (e) {
        addLog(e instanceof Error ? e.message : String(e), "error");
      }

      if (finalEvent) {
        await persistResults(runId, dataset, finalEvent);
      }
    },

    stop: () => {
      abortController?.abort();
      addLog(tr("optimize.stopped"), "warn");
    },

    reset: () => {
      abortController?.abort();
      abortController = null;
      set(INITIAL);
    },
  };
});
