import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyInteractiveProgress,
  reduceInteractiveAction,
} from '../features/interactive/state';
import { ENCOUNTER_IDS } from '../features/interactive/encounters';
import { chooseAutoBattleAction } from '../features/interactive/battle';
import {
  createGameSave,
  parseImportSave,
  restoreSavedPlayer,
} from '../features/save/saveCodec';
import { createInitialPlayer } from '../utils/playerUtils';
import { RealmType } from '../types';

const clone = (value) => JSON.parse(JSON.stringify(value));
function initial(overrides = {}) {
  return {
    player: restoreSavedPlayer(
      {
        ...createInitialPlayer('集成测试同学', 'npu:algorithm:pingmin'),
        hp: 80,
        maxHp: 100,
        exp: 7,
        spiritStones: 30,
        ...overrides,
      },
      '集成测试同学'
    ),
    logs: [],
    interactive: emptyInteractiveProgress(),
  };
}
function dispatch(snapshot, command, now = 1700000000000) {
  const before = structuredClone(snapshot);
  const after = reduceInteractiveAction(snapshot, command, now);
  assert.deepEqual(snapshot, before, 'reducer不能改写传入的已保存快照');
  return after;
}
function begin(snapshot, seed = 1729) {
  return dispatch(snapshot, {
    type: 'begin',
    id: `action-${snapshot.interactive.nextSeq}`,
    seed,
  });
}
function choose(snapshot, choiceId) {
  return dispatch(snapshot, {
    type: 'choose',
    id: snapshot.interactive.pending.id,
    choiceId,
  });
}
function acknowledge(snapshot) {
  return dispatch(snapshot, {
    type: 'acknowledge',
    id: snapshot.interactive.pending.id,
  });
}
function commandBattle(snapshot, action) {
  return dispatch(snapshot, {
    type: 'battle',
    id: snapshot.interactive.pending.id,
    seq: snapshot.interactive.pending.battle.commandSeq + 1,
    action,
  });
}
/** 真正经过同一个存档封装、JSON与导入校验，模拟每次合法提交后的刷新。 */
function reload(snapshot) {
  const saved = createGameSave(
    snapshot.player,
    snapshot.logs,
    1700000000000,
    snapshot.interactive
  );
  const parsed = parseImportSave(JSON.stringify(saved));
  return {
    player: restoreSavedPlayer(parsed.player, parsed.player.name),
    logs: parsed.logs,
    interactive: parsed.interactive ?? emptyInteractiveProgress(),
  };
}
function skipToNextLab(snapshot) {
  let next = acknowledge(snapshot);
  for (let index = 0; index < 5; index++)
    next = acknowledge(choose(begin(next), 'leave'));
  return begin(next);
}
function finishBattle(snapshot, refreshEveryRound = false) {
  let next = snapshot;
  while (next.interactive.pending.phase === 'battle') {
    next = commandBattle(
      next,
      chooseAutoBattleAction(next.interactive.pending.battle)
    );
    if (refreshEveryRound) next = reload(next);
  }
  return next;
}

test('六机缘按有效行动轮换；开始只保存选项，不改变角色、日志或完成事实', () => {
  let state = initial();
  const expected = [...ENCOUNTER_IDS, ENCOUNTER_IDS[0]];
  for (let index = 0; index < expected.length; index++) {
    const before = structuredClone(state);
    state = begin(state, index + 1);
    assert.equal(state.interactive.pending.encounter.id, expected[index]);
    assert.equal(state.interactive.pending.phase, 'choice');
    assert.deepEqual(clone(state.player), clone(before.player));
    assert.deepEqual(state.logs, before.logs);
    assert.deepEqual(state.interactive.facts, {});
    assert.equal(state.interactive.nextSeq, index + 2);
    assert.strictEqual(begin(state), state, '重复开始不能重抽或覆盖现场');
    state = reload(state);
    state = choose(state, 'leave');
    assert.deepEqual(clone(state.player), clone(before.player));
    assert.equal(state.interactive.lastSettledSeq, index + 1);
    assert.equal(state.logs.length, index + 1);
    state = acknowledge(reload(state));
  }
});

test('排查与协作产生不同实际结算，下一轮关联机缘兑现各自的新选项', () => {
  const original = initial();
  const prepared = begin(original);
  const diagnosed = choose(prepared, 'diagnose');
  const cooperative = choose(prepared, 'cooperate');
  assert.equal(diagnosed.player.hp, 74);
  assert.equal(diagnosed.player.exp, 17);
  assert.equal(diagnosed.player.spiritStones, 30);
  assert.equal(cooperative.player.hp, 77);
  assert.equal(cooperative.player.exp, 13);
  assert.equal(cooperative.player.spiritStones, 26);
  assert.equal(diagnosed.interactive.facts['lab-diagnosed'], true);
  assert.equal(cooperative.interactive.facts['lab-partner'], 'classmate');
  const labWithNotes = skipToNextLab(reload(diagnosed));
  const labWithCooperation = skipToNextLab(reload(cooperative));
  assert.ok(
    labWithNotes.interactive.pending.encounter.choices.some(
      (item) => item.id === 'apply-notes'
    )
  );
  assert.ok(
    labWithCooperation.interactive.pending.encounter.choices.some(
      (item) => item.id === 'retest'
    )
  );
  assert.equal(
    labWithNotes.interactive.pending.encounter.choices.some(
      (item) => item.id === 'retest'
    ),
    false
  );
  const reused = choose(labWithNotes, 'apply-notes');
  assert.equal(reused.player.hp, diagnosed.player.hp - 2);
  assert.equal(reused.interactive.facts['lab-notes-used'], true);
});

test('挑战入场不发奖，胜利总额仅结算一次并解锁下一次进阶联调', () => {
  const start = initial({ attack: 10000, speed: 10000 });
  let state = choose(begin(start), 'challenge');
  assert.equal(state.interactive.pending.phase, 'battle');
  assert.deepEqual(state.player, start.player);
  assert.equal(state.logs.length, 0);
  assert.equal(state.interactive.lastSettledSeq, 0);
  assert.deepEqual(state.interactive.facts, {});
  state = commandBattle(reload(state), 'attack');
  assert.equal(state.interactive.pending.battle.outcome, 'victory');
  assert.equal(state.interactive.pending.phase, 'result');
  assert.equal(state.player.exp, start.player.exp + 24);
  assert.equal(state.player.spiritStones, start.player.spiritStones + 8);
  assert.equal(state.logs.length, 1);
  assert.equal(state.interactive.lastSettledSeq, 1);
  assert.equal(state.interactive.facts['lab-challenge-won'], true);
  assert.strictEqual(choose(state, 'challenge'), state);
  assert.strictEqual(commandBattle(state, 'attack'), state);
  const next = skipToNextLab(reload(state));
  assert.equal(
    next.interactive.pending.encounter.choices.find(
      (item) => item.id === 'challenge'
    ).label,
    '接受进阶联调'
  );
});

test('重复选择、战斗指令序号、提前确认和旧行动ID不能推进或重复结算', () => {
  const prepared = begin(initial());
  assert.strictEqual(
    dispatch(prepared, { type: 'acknowledge', id: 'action-1' }),
    prepared
  );
  assert.strictEqual(
    dispatch(prepared, {
      type: 'choose',
      id: 'old-action',
      choiceId: 'diagnose',
    }),
    prepared
  );
  const battling = choose(prepared, 'challenge');
  assert.strictEqual(choose(battling, 'diagnose'), battling);
  assert.strictEqual(
    dispatch(battling, {
      type: 'battle',
      id: 'action-1',
      seq: 2,
      action: 'attack',
    }),
    battling
  );
  const advanced = commandBattle(battling, 'defend');
  assert.strictEqual(
    dispatch(advanced, {
      type: 'battle',
      id: 'action-1',
      seq: 1,
      action: 'defend',
    }),
    advanced
  );
  const completed = commandBattle(advanced, 'retreat');
  const acknowledged = acknowledge(completed);
  assert.strictEqual(
    dispatch(acknowledged, { type: 'acknowledge', id: 'action-1' }),
    acknowledged
  );
  const second = begin(acknowledged);
  for (const command of [
    { type: 'choose', id: 'action-1', choiceId: 'cooperate' },
    { type: 'battle', id: 'action-1', seq: 2, action: 'attack' },
    { type: 'acknowledge', id: 'action-1' },
  ])
    assert.strictEqual(dispatch(second, command), second);
});

test('每轮刷新继续同一个对手、意图、随机序列和父行动，终局与不停顿操作相同', () => {
  const state = choose(
    begin(
      initial({ hp: 150, maxHp: 150, attack: 15, defense: 12, speed: 8 }),
      981237
    ),
    'challenge'
  );
  assert.deepEqual(clone(reload(state)), clone(state));
  const uninterrupted = finishBattle(state);
  const restarted = finishBattle(reload(state), true);
  assert.deepEqual(clone(restarted), clone(uninterrupted));
  assert.equal(restarted.logs.length, 1);
  assert.equal(restarted.interactive.lastSettledSeq, 1);
});

test('撤离只结算已经发生的精力损耗，保留未完成记录且不虚构胜利或扣分', () => {
  const start = initial({ attack: 1, speed: 0 });
  const entered = choose(begin(start), 'challenge');
  const damaged = commandBattle(entered, 'defend');
  assert.equal(damaged.interactive.pending.phase, 'battle');
  const state = commandBattle(reload(damaged), 'retreat');
  assert.equal(state.interactive.pending.phase, 'result');
  assert.equal(state.interactive.pending.battle.outcome, 'retreat');
  assert.equal(state.player.hp, damaged.interactive.pending.battle.player.hp);
  assert.ok(state.player.hp < start.player.hp);
  assert.equal(state.player.exp, start.player.exp);
  assert.equal(state.player.spiritStones, start.player.spiritStones);
  assert.equal(state.interactive.facts['lab-challenge-unfinished'], true);
  assert.equal(state.interactive.facts['lab-challenge-won'], undefined);
  const next = skipToNextLab(reload(state));
  assert.match(next.interactive.pending.encounter.story, /还没有完成/);
});

test('十二轮僵持保持双方存活，父行动只结算损耗并显示独立终局', () => {
  const start = initial({
    realm: RealmType.ImmortalAscension,
    realmLevel: 9,
    hp: 1000000000,
    maxHp: 1000000000,
    attack: 0,
    defense: 1000000000,
    speed: 0,
  });
  let state = choose(begin(start), 'challenge');
  for (let round = 1; round <= 12; round++)
    state = reload(commandBattle(state, 'attack'));
  assert.equal(state.interactive.pending.battle.outcome, 'stalemate');
  assert.equal(state.interactive.pending.battle.completedRounds, 12);
  assert.equal(state.interactive.pending.result.title, '僵持撤离');
  assert.ok(state.player.hp > 0);
  assert.equal(state.player.exp, start.player.exp);
  assert.equal(state.player.spiritStones, start.player.spiritStones);
  assert.equal(state.player.realm, start.player.realm);
  assert.equal(state.player.realmLevel, start.player.realmLevel);
  assert.equal(state.logs.length, 1);
});

test('力竭将降级、清绩点与回满精力写在一次终局内，刷新或迟到命令不再次降级', () => {
  const start = initial({
    hp: 1,
    realmLevel: 3,
    attack: 1,
    defense: 0,
    speed: 0,
    exp: 50,
  });
  let state = commandBattle(choose(begin(start), 'challenge'), 'attack');
  assert.equal(state.interactive.pending.battle.outcome, 'defeat');
  assert.equal(state.interactive.pending.battle.player.hp, 0);
  assert.equal(state.interactive.pending.phase, 'result');
  assert.equal(state.player.realmLevel, 2);
  assert.equal(state.player.exp, 0);
  assert.equal(state.player.hp, state.player.maxHp);
  assert.equal(state.player.spiritStones, start.player.spiritStones);
  assert.equal(state.logs.length, 1);
  assert.match(state.interactive.pending.result.text, /延毕/);
  state = reload(state);
  assert.strictEqual(commandBattle(state, 'attack'), state);
  assert.strictEqual(choose(state, 'challenge'), state);
  const after = acknowledge(state);
  assert.equal(after.player.realmLevel, 2);
  assert.equal(after.logs.length, 1);
});

test('费用按提交时的新角色复验，资源不足保留原选项，补足后可完成同一行动', () => {
  const prepared = begin(initial());
  const nowPoor = {
    ...prepared,
    player: { ...prepared.player, spiritStones: 3 },
  };
  const before = structuredClone(nowPoor);
  assert.throws(() => choose(nowPoor, 'cooperate'), /学分还差1/);
  assert.deepEqual(nowPoor, before);
  const refilled = reload({
    ...nowPoor,
    player: { ...nowPoor.player, spiritStones: 4 },
  });
  const settled = choose(refilled, 'cooperate');
  assert.equal(settled.player.spiritStones, 0);
  assert.equal(settled.interactive.pending.id, prepared.interactive.pending.id);
  assert.equal(
    settled.interactive.pending.seq,
    prepared.interactive.pending.seq
  );
});

test('无剧情扩展的旧存档继续可读，新存档完整保留待选、战斗与终局扩展', () => {
  const start = initial();
  const old = parseImportSave(
    JSON.stringify(createGameSave(start.player, start.logs, 123))
  );
  assert.equal(old.interactive, undefined);
  const restored = {
    player: restoreSavedPlayer(old.player, old.player.name),
    logs: old.logs,
    interactive: old.interactive ?? emptyInteractiveProgress(),
  };
  assert.equal(begin(restored).interactive.pending.encounter.id, 'lab-device');
  const prepared = begin(start);
  const battling = choose(prepared, 'challenge');
  const result = commandBattle(battling, 'retreat');
  for (const snapshot of [prepared, battling, result, acknowledge(result)]) {
    assert.deepEqual(clone(reload(snapshot)), clone(snapshot));
  }
});

test('损坏扩展应拒绝导入，不能悄悄抹掉现场或接受无效冷却、随机和结算状态', () => {
  const battling = commandBattle(
    choose(begin(initial()), 'challenge'),
    'defend'
  );
  const validSave = createGameSave(
    battling.player,
    battling.logs,
    123,
    battling.interactive
  );
  const cases = [
    [
      '扩展版本',
      (progress) => {
        progress.version = 2;
      },
    ],
    [
      '待处理空值',
      (progress) => {
        progress.pending = null;
      },
    ],
    [
      '行动序号冲突',
      (progress) => {
        progress.pending.seq = progress.nextSeq;
      },
    ],
    [
      '未知机缘',
      (progress) => {
        progress.pending.encounter.id = 'unknown';
      },
    ],
    [
      '负数收益',
      (progress) => {
        progress.pending.encounter.choices[0].reward.exp = -1;
      },
    ],
    [
      '随机数超过uint32',
      (progress) => {
        progress.pending.battle.rngState = 4294967296;
      },
    ],
    [
      '随机数零吸收态',
      (progress) => {
        progress.pending.battle.rngState = 0;
      },
    ],
    [
      '负数冷却',
      (progress) => {
        progress.pending.battle.breakCooldown = -1;
      },
    ],
    [
      '冷却超过上限',
      (progress) => {
        progress.pending.battle.breakCooldown = 3;
      },
    ],
    [
      '固守超过上限',
      (progress) => {
        progress.pending.battle.enemyGuardRounds = 3;
      },
    ],
    [
      '回合与指令不一致',
      (progress) => {
        progress.pending.battle.commandSeq = 0;
      },
    ],
    [
      '缺失初始精力',
      (progress) => {
        delete progress.pending.battle.playerHpBefore;
      },
    ],
    [
      '日志结构损坏',
      (progress) => {
        progress.pending.battle.rounds[0] = null;
      },
    ],
    [
      '完成阶段缺少结果',
      (progress) => {
        progress.pending.phase = 'result';
        progress.lastSettledSeq = progress.pending.seq;
      },
    ],
  ];
  const accepted = [];
  for (const [label, damage] of cases) {
    const broken = clone(validSave);
    damage(broken.interactive);
    try {
      parseImportSave(JSON.stringify(broken));
      accepted.push(label);
    } catch {
      /* rejection expected */
    }
  }
  assert.deepEqual(
    accepted,
    [],
    `以下损坏记录被错误接受：${accepted.join('、')}`
  );
});
