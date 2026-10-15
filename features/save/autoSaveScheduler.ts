interface TimerClock {
  setTimeout(
    callback: () => void,
    delay: number
  ): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}

/** 尾沿防抖保留 2 秒延迟，持续更新时最多等待 10 秒。 */
export function createAutoSaveScheduler<T>(
  save: (snapshot: T) => void,
  clock: TimerClock = {
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (timer) => clearTimeout(timer),
  },
  delay = 2000,
  maxWait = 10000
) {
  let trailingTimer: ReturnType<typeof setTimeout> | undefined;
  let maxTimer: ReturnType<typeof setTimeout> | undefined;
  let pending: { snapshot: T } | undefined;

  function cancel() {
    if (trailingTimer !== undefined) clock.clearTimeout(trailingTimer);
    if (maxTimer !== undefined) clock.clearTimeout(maxTimer);
    trailingTimer = undefined;
    maxTimer = undefined;
    pending = undefined;
  }

  function flush() {
    const latest = pending;
    cancel();
    if (latest) save(latest.snapshot);
  }

  return {
    schedule(snapshot: T) {
      pending = { snapshot };
      if (trailingTimer !== undefined) clock.clearTimeout(trailingTimer);
      trailingTimer = clock.setTimeout(flush, delay);
      if (maxTimer === undefined) maxTimer = clock.setTimeout(flush, maxWait);
    },
    cancel,
  };
}
