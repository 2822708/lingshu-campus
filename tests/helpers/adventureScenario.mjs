// 使用固定时间与随机序列，比较冒险收益及随机调用顺序。
// 所有输入均为测试数据；不触发副本、AI 或网络服务。
export async function runAdventureScenario(executeCore, basePlayer, scenario) {
  let state = structuredClone({ ...basePlayer, ...scenario.playerOverrides });
  const logs = [];
  const visuals = [];
  const battleReplays = [];
  const timers = [];
  const cssEvents = [];
  let randomState = scenario.seed >>> 0;
  let randomCalls = 0;
  const oldRandom = Math.random;
  const oldNow = Date.now;
  const oldTimeout = globalThis.setTimeout;
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const scheduled = [];

  Math.random = () => {
    randomState = (Math.imul(1664525, randomState) + 1013904223) >>> 0;
    randomCalls += 1;
    return randomState / 4294967296;
  };
  Date.now = () => 1792022400000;
  globalThis.setTimeout = (callback, delay) => {
    timers.push(delay);
    scheduled.push(callback);
    return 1;
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      body: {
        classList: {
          add: (value) => cssEvents.push(['add', value]),
          remove: (value) => cssEvents.push(['remove', value]),
        },
      },
    },
  });

  try {
    await executeCore({
      result: structuredClone(scenario.result),
      battleContext: scenario.battleContext ?? null,
      player: structuredClone(state),
      setPlayer: (update) => {
        state = typeof update === 'function' ? update(state) : update;
      },
      addLog: (...entry) => logs.push(entry),
      triggerVisual: (...effect) => visuals.push(effect),
      onOpenBattleModal: (replay) => battleReplays.push(replay),
      adventureType: scenario.adventureType ?? 'normal',
      realmName: scenario.realmName,
      skipBattle: scenario.skipBattle ?? false,
    });
    for (const callback of scheduled) await callback();

    // uid 的模块级计数器与其它调用方共享。只规范化计数器，保留日期和随机后缀。
    const generatedIds = new Map();
    const normalized = JSON.stringify(
      {
        player: state,
        logs,
        visuals,
        battleReplays,
        randomCalls,
        timers,
        cssEvents,
      },
      (key, value) => {
        if (key === 'id' && typeof value === 'string') {
          const match = /^(1792022400000)-\d+-([a-z0-9]+)$/.exec(value);
          if (match) {
            if (!generatedIds.has(value))
              generatedIds.set(value, generatedIds.size + 1);
            return `${match[1]}-generated${generatedIds.get(value)}-${match[2]}`;
          }
        }
        return value;
      }
    );
    return JSON.parse(normalized);
  } finally {
    Math.random = oldRandom;
    Date.now = oldNow;
    globalThis.setTimeout = oldTimeout;
    if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument);
    else delete globalThis.document;
  }
}
