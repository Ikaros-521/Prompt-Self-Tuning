import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
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

export interface OptimizerState {
  status: "idle" | "running" | "done" | "stopped" | "error";
  logs: LogLine[];
  chart: ChartPoint[];
  currentRound: number;
  totalRounds: number;
  currentPrompt: string;
  bestScore: number;
  currentScore: number;
  tokens: number;
  results: CaseResult[]; // 本轮样本结果
  lastRound?: RoundRecord;
  runId?: string;
  errorMessage?: string;
}

const INITIAL: OptimizerState = {
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

export function useOptimizer() {
  const { t } = useTranslation();
  const [state, setState] = useState<OptimizerState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef<string | null>(null);

  const addLog = useCallback(
    (text: string, level: LogLine["level"] = "info") => {
      setState((s) => ({
        ...s,
        logs: [
          ...s.logs,
          { id: uid("log"), text, level, ts: Date.now() },
        ].slice(-500), // 保留最后 500 条
      }));
    },
    [],
  );

  const start = useCallback(
    async (dataset: Dataset, executor: Provider, judge: Provider, config: OptimizeConfig) => {
      const controller = new AbortController();
      abortRef.current = controller;
      const runId = uid("run");
      runIdRef.current = runId;

      setState({
        ...INITIAL,
        status: "running",
        runId,
        totalRounds: config.maxRounds,
      });

      // 创建 run 记录
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

      const gen = runOptimization({ dataset, executor, judge, config, signal: controller.signal });

      let finalEvent: Extract<OptimizerEvent, { type: "done" }> | null = null;

      try {
        for await (const ev of gen) {
          applyEvent(ev);
          if (ev.type === "done") finalEvent = ev;
        }
      } catch (e) {
        addLog(
          e instanceof Error ? e.message : String(e),
          "error",
        );
      }

      // 持久化：存档所有 versions + 更新 run
      if (finalEvent) {
        await persistResults(runId, dataset, finalEvent);
      }
    },
    [addLog],
  );

  /** 把事件应用到 state */
  const applyEvent = useCallback(
    (ev: OptimizerEvent) => {
      switch (ev.type) {
        case "init":
          addLog(t("log.init", { message: ev.message }));
          break;
        case "info":
          addLog(ev.message);
          break;
        case "warn":
          addLog(ev.message, "warn");
          break;
        case "error":
          addLog(ev.message, "error");
          setState((s) => ({ ...s, status: "error", errorMessage: ev.message }));
          break;
        case "seed":
          addLog(
            t("log.seed", {
              score: ev.baselineScore.toFixed(3),
              source: t(`optimize.seedSource.${ev.source}`),
            }),
            "success",
          );
          setState((s) => ({
            ...s,
            currentPrompt: ev.prompt,
            currentScore: ev.baselineScore,
            bestScore: ev.baselineScore,
          }));
          break;
        case "round_start":
          addLog(t("log.roundStart", { round: ev.round, total: ev.totalRounds }));
          setState((s) => ({
            ...s,
            currentRound: ev.round,
            results: [],
          }));
          break;
        case "sampled":
          addLog(t("log.sampled", { count: ev.indices.length }));
          break;
        case "testing":
          // 不写日志（太频繁），仅可做进度展示
          break;
        case "case_done": {
          const flag = ev.result.formatPassed
            ? ev.result.passed
              ? "✓"
              : "·"
            : "✗";
          addLog(
            t("log.caseDone", {
              index: ev.result.index + 1,
              score: ev.result.score.toFixed(2),
              flag,
            }),
            ev.result.passed ? "success" : "warn",
          );
          setState((s) => ({
            ...s,
            results: [...s.results, ev.result],
          }));
          break;
        }
        case "round_scored":
          addLog(
            t("log.roundScored", {
              train: ev.avgScore.toFixed(3),
              dev: ev.devScore.toFixed(3),
            }),
          );
          setState((s) => ({
            ...s,
            currentScore: ev.avgScore,
            chart: [
              ...s.chart,
              { round: s.currentRound, train: ev.avgScore, dev: ev.devScore },
            ],
          }));
          break;
        case "reflecting":
          if (ev.analysis) addLog(`${t("log.reflecting")} ${ev.analysis}`);
          else addLog(t("log.reflecting"));
          break;
        case "rewriting":
          if (ev.newPrompt) {
            addLog(t("log.rewriting"), "success");
            if (ev.changes?.length) {
              for (const c of ev.changes) addLog(`  · ${c}`);
            }
          } else {
            addLog(t("log.rewriting"));
          }
          break;
        case "validated":
          addLog(
            t("log.validated", {
              dev: ev.devScore.toFixed(3),
              result: ev.adopted ? "✓ 采纳" : "× 丢弃",
            }),
            ev.adopted ? "success" : "warn",
          );
          break;
        case "agent_decision":
          addLog(
            t("log.agentDecision", {
              decision: ev.shouldStop ? "停止" : "继续",
              reason: ev.reason,
            }),
          );
          break;
        case "round_end":
          setState((s) => ({ ...s, lastRound: ev.roundRecord }));
          break;
        case "done": {
          finalDone(ev);
          break;
        }
      }
    },
    [addLog, t],
  );

  /** 处理完成事件（内联，避免闭包问题——这里用 setState） */
  const finalDone = useCallback(
    (ev: Extract<OptimizerEvent, { type: "done" }>) => {
      let status: OptimizerState["status"] = "done";
      let level: LogLine["level"] = "success";
      let msg = t("optimize.done", { score: ev.bestScore.toFixed(3) });
      if (ev.reason === "stopped") {
        status = "stopped";
        level = "warn";
        msg = t("optimize.stopped");
      } else if (ev.reason === "error") {
        status = "error";
        level = "error";
      }
      addLog(msg, level);
      setState((s) => ({
        ...s,
        status,
        bestScore: ev.bestScore,
        currentPrompt: ev.finalPrompt || s.currentPrompt,
        tokens: ev.totalTokens,
      }));
    },
    [addLog, t],
  );

  /** 持久化结果到 IndexedDB */
  const persistResults = useCallback(
    async (
      runId: string,
      dataset: Dataset,
      ev: Extract<OptimizerEvent, { type: "done" }>,
    ) => {
      try {
        // 存档所有版本（去重：已有同 content 的跳过）
        const existing = await db.promptVersions
          .where("datasetId")
          .equals(dataset.id)
          .toArray();
        const existingContents = new Set(existing.map((v) => v.content));
        const toAdd = ev.versions.filter(
          (v) => !existingContents.has(v.content),
        );
        if (toAdd.length) await db.promptVersions.bulkAdd(toAdd);

        // 更新 run
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
          toast.success(
            t("optimize.done", { score: ev.bestScore.toFixed(3) }),
          );
        }
      } catch (e) {
        addLog(
          `存档失败：${e instanceof Error ? e.message : String(e)}`,
          "error",
        );
      }
    },
    [addLog, t],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    addLog(t("optimize.stopped"), "warn");
  }, [addLog, t]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    runIdRef.current = null;
    setState(INITIAL);
  }, []);

  return { state, start, stop, reset };
}
