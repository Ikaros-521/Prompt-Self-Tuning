/**
 * 并发执行工具。
 *
 * 设计目标：把「N 个样本逐个执行+评分」从串行改成最多 concurrency 个并发，
 * 同时保留每个样本完成时的实时回调（供 UI 实时展示进度/日志）。
 *
 * 两个核心原语：
 * - mapPool：Promise 风格，结果按**原始索引**顺序返回，完成顺序通过 onItem 实时回调。
 * - poolWithEvents：async generator 风格，每个任务完成就 yield 一条事件，
 *   供 async generator 调用方（如 runOptimization / evaluatePrompt）直接 for await 消费。
 */

/** 校验并钳制并发度到 [1, max] */
export function clampConcurrency(
  concurrency: number | undefined,
  max = 16,
): number {
  const n = Math.floor(concurrency ?? 1);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, max);
}

/**
 * 限定并发的 map。
 *
 * @param items 输入数组
 * @param concurrency 最大并发数（<1 视为 1）
 * @param fn 对每个 item 的异步处理；抛错会让整体 reject（fail-fast）
 * @param signal 可选取消信号
 * @param onItem 每个任务完成时按完成顺序回调（index 是原始下标）
 * @returns 结果数组，按 items 原始顺序排列
 */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
  onItem?: (item: T, index: number, result: R) => void,
): Promise<R[]> {
  const limit = clampConcurrency(concurrency);
  const results: R[] = new Array(items.length);
  let cursor = 0; // 下一个待分配的 index
  let active = 0;
  let rejected = false;

  return new Promise<R[]>((resolve, reject) => {
    // 空数组直接完成
    if (items.length === 0) {
      resolve(results);
      return;
    }

    const onAbort = () => {
      if (!rejected) {
        rejected = true;
        reject(new DOMException("Aborted", "AbortError"));
      }
    };
    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener("abort", onAbort, { once: true });
    }

    const launch = () => {
      // 已被取消 / 已失败 → 停止派发
      if (rejected) return;
      while (active < limit && cursor < items.length) {
        const idx = cursor++;
        active++;
        const item = items[idx];
        fn(item, idx)
          .then((res) => {
            if (rejected) return;
            results[idx] = res;
            active--;
            onItem?.(item, idx, res);
            if (cursor < items.length) {
              launch();
            } else if (active === 0) {
              resolve(results);
            }
          })
          .catch((err) => {
            if (!rejected) {
              rejected = true;
              reject(err);
            }
          });
      }
    };

    launch();
  });
}

/**
 * poolWithEvents 产出的事件：每个任务完成时按完成顺序产生一条。
 */
export interface PoolEvent<R> {
  /** 原始下标 */
  index: number;
  /** 任务结果 */
  result: R;
  /** 总任务数 */
  total: number;
}

/**
 * 并发执行的 async generator 版本：每个任务一完成就 yield，
 * 供 async generator 调用方（runOptimization / evaluatePrompt）直接 for await 消费，
 * 从而保留「逐样本实时事件」语义。
 *
 * yield 顺序 = 完成顺序（非下标顺序）；全部完成后 generator 结束。
 * 任一任务抛错 / abort 时，错误从 generator 抛出（与串行 fail-fast 一致）。
 *
 * @param total 总任务数（用于在每条事件里带上 total，便于 UI 显示 N/M）
 */
export async function* poolWithEvents<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
  total?: number,
): AsyncGenerator<PoolEvent<R>, R[], unknown> {
  const n = total ?? items.length;
  /** 待 yield 的事件队列（完成顺序） */
  const queue: PoolEvent<R>[] = [];
  let queueResolve: ((v: boolean) => void) | null = null;
  let done = false;

  /** 唤醒等待中的 generator */
  const notify = () => {
    if (queueResolve) {
      const r = queueResolve;
      queueResolve = null;
      r(true);
    }
  };

  const promise = mapPool<T, R>(
    items,
    concurrency,
    fn,
    signal,
    (_item, index, result) => {
      queue.push({ index, result, total: n });
      notify();
    },
  ).then((all) => {
    done = true;
    notify();
    return all;
  });

  // 先把异常也桥接到 generator：mapPool reject 时让 done=true 并记录
  promise.catch(() => {
    done = true;
    notify();
  });

  // 主循环：消费完成队列，直到全部完成
  while (!done || queue.length > 0) {
    if (queue.length === 0) {
      // 等待新完成事件
      await new Promise<boolean>((resolve) => {
        queueResolve = resolve;
      });
    }
    while (queue.length > 0) {
      const ev = queue.shift()!;
      yield ev;
    }
  }

  // 此时 promise 已 settle；若是 reject 则这里会抛错，与串行行为一致
  return await promise;
}
