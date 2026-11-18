import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createCardBattle,
  stepCardBattle,
  getCardBattleIncomingPreview,
} from '../features/card-battle/engine';
import { CARDS } from '../features/card-battle/catalog';
import { createRogueRoom } from '../features/rogue-mode/catalog';
import { createRogueRun } from '../features/rogue-mode/engine';
import { getCommittedBattleCue } from '../features/card-battle/ui/CardBattleView';
import { BattleActor } from '../features/card-battle/ui/BattleActor';
import { getBossPresentation } from '../features/card-battle/ui/battle-art';
import { getConstructSounds } from '../features/card-battle/ui/battle-sound';
import { playSound } from '../utils/sound';

function battle(floor = 20) {
  const run = createRogueRun({
    runId: 'art-test',
    seed: 17,
    jobId: 'vanguard',
    starterId: 'steady',
  });
  run.floor = floor;
  const room = createRogueRoom(run, 0, 'sentinel');
  const cards = Array.from({ length: 10 }, (_, index) => {
    const templateId = index === 0 ? 'break' : 'strike';
    return { ...CARDS[templateId], id: `c${index}`, templateId };
  });
  const state = createCardBattle({
    id: `art-test:${floor}`,
    seed: 17,
    maxTurns: 26,
    player: { hp: 100, maxHp: 100, attack: 12, defense: 5, speed: 12 },
    enemy: room.enemy,
    cards,
  });
  state.hand = cards.slice(0, 4).map((card) => card.id);
  state.drawPile = cards.slice(4).map((card) => card.id);
  state.discardPile = [];
  return state;
}
const step = (state, action) =>
  stepCardBattle(state, { id: state.id, seq: state.commandSeq + 1, ...action });

test('第20关反震只依据成功提交后真正扣除的自身精力，并与敌人受击并列', () => {
  const before = battle();
  const after = step(before, { type: 'play', cardId: 'c1' });
  const cue = getCommittedBattleCue(before, after);
  assert.ok(after.player.hp < before.player.hp);
  assert.equal(cue.reflected, before.player.hp - after.player.hp);
  assert.ok(cue.enemyDamage > 0);
  const html = renderToStaticMarkup(
    React.createElement(BattleActor, { side: 'player', cue })
  );
  assert.match(html, /ct-effect-reflected/);
  assert.match(html, new RegExp(`反震 −${cue.reflected}`));
  assert.equal(getCommittedBattleCue(after, structuredClone(after)), null);
  assert.equal(getCommittedBattleCue(before, before), null);
});

test('破护分别说明实际清除的状态，未有固守时不能误报解除固守', () => {
  const before = battle();
  before.enemy.guardRounds = 0;
  assert.ok(before.enemy.thorns > 0);
  const after = step(before, { type: 'play', cardId: 'c0' });
  const cue = getCommittedBattleCue(before, after);
  assert.equal(cue.breakLabel, '解除反震');
  assert.equal(cue.brokeBlock, 1);
  assert.equal(cue.reflected, 0);
  const empty = battle();
  empty.enemy.guardRounds = 0;
  empty.enemy.thorns = 0;
  assert.equal(
    getCommittedBattleCue(empty, step(empty, { type: 'play', cardId: 'c0' }))
      .brokeBlock,
    0
  );
});

test('穿透量不会把被护盾拦下的攻击或超出剩余精力的部分当作实际命中', () => {
  const before = battle();
  before.turn = 2;
  before.player.energy = 0;
  before.player.block = 100;
  before.player.hp = 1;
  before.intent = {
    type: 'strong',
    name: '谐振脉冲',
    description: '',
    damage: 20,
    crit: false,
  };
  const hit = getCardBattleIncomingPreview(before);
  assert.ok(hit.piercing > 0);
  const cue = getCommittedBattleCue(before, step(before, { type: 'end-turn' }));
  assert.equal(cue.piercing, 1);
  assert.equal(cue.playerDamage, 1);
  assert.equal(cue.enemyMoveName, '谐振脉冲');
  assert.equal(cue.blocked, hit.prevented);
  const protectedState = battle();
  protectedState.turn = 2;
  protectedState.player.energy = 1;
  protectedState.player.block = 100;
  protectedState.intent = { ...before.intent };
  assert.equal(
    getCommittedBattleCue(
      protectedState,
      step(protectedState, { type: 'end-turn' })
    ).piercing,
    0
  );
});

test('修复演出读取实际恢复，满血失败窗口不产生虚假的回扣', () => {
  const full = battle();
  const fullCue = getCommittedBattleCue(full, step(full, { type: 'end-turn' }));
  assert.equal(fullCue.enemyHealed, 0);
  const wounded = battle();
  wounded.enemy.hp -= 15;
  const healed = step(wounded, { type: 'end-turn' });
  const cue = getCommittedBattleCue(wounded, healed);
  assert.equal(cue.enemyHealed, 6);
  const html = renderToStaticMarkup(
    React.createElement(BattleActor, {
      side: 'enemy',
      setting: 'trial',
      presentation: 'repair',
      cue,
      constructState: {
        guard: true,
        thorns: false,
        lowHealth: false,
        defeated: false,
      },
    })
  );
  assert.match(html, /data-repairing="true"/);
  assert.match(html, /\+6/);
  const fullHtml = renderToStaticMarkup(
    React.createElement(BattleActor, {
      side: 'enemy',
      setting: 'trial',
      presentation: 'repair',
      cue: fullCue,
    })
  );
  assert.doesNotMatch(fullHtml, /data-repairing/);
});

test('BOSS只按章节考核节点选图；续档保留静态固守与反震但不重新起手', () => {
  assert.equal(getBossPresentation(20, true), 'resonator');
  assert.equal(getBossPresentation(20, false), undefined);
  assert.equal(getBossPresentation(10, true), 'calculus');
  for (const [floor, presentation] of [
    [20, 'resonator'],
    [30, 'noise'],
    [40, 'repair'],
    [50, 'defense'],
  ]) {
    const state = battle(floor);
    const html = renderToStaticMarkup(
      React.createElement(BattleActor, {
        side: 'enemy',
        setting: 'trial',
        presentation,
        cue: null,
        constructState: {
          guard: state.enemy.guardRounds > 0,
          thorns: state.enemy.thorns > 0,
          lowHealth: false,
          defeated: false,
        },
      })
    );
    assert.match(html, new RegExp(`data-art="${presentation}"`));
    assert.doesNotMatch(
      html,
      /data-enemy-move|data-repairing|is-attacking|ct-effect-number/
    );
  }
});

test('精英资源只供精英匹配；普通同类仍走原场景形体', () => {
  const props = { side: 'enemy', setting: 'trial', archetype: 'sprinter' };
  const normal = renderToStaticMarkup(React.createElement(BattleActor, props));
  const elite = renderToStaticMarkup(
    React.createElement(BattleActor, { ...props, elite: true })
  );
  assert.doesNotMatch(normal, /data-art="elite-sprinter"/);
  assert.match(elite, /data-art="elite-sprinter"/);
  assert.match(elite, /data-layer="body"/);
  assert.match(elite, /data-layer="part"/);
});

test('铜环、断电、宽带和尖峰分别发声，零反震和零修复不播放成功音', () => {
  const before = battle();
  const cue = getCommittedBattleCue(before, step(before, { type: 'end-turn' }));
  assert.deepEqual(getConstructSounds('resonator', cue, 72), [
    { name: 'trial-ring', delay: 72 },
  ]);
  assert.deepEqual(
    getConstructSounds(
      'repair',
      { ...cue, enemyMoveName: '维护窗口', enemyHealed: 0 },
      72
    ),
    []
  );
  assert.deepEqual(
    getConstructSounds(
      'repair',
      { ...cue, enemyMoveName: '维护窗口', enemyHealed: 7 },
      72
    ),
    [{ name: 'trial-repair', delay: 162 }]
  );
  assert.deepEqual(
    getConstructSounds(
      'resonator',
      { ...cue, actor: 'player', reflected: 0, enemyHealed: 0 },
      160
    ),
    []
  );
  assert.deepEqual(
    getConstructSounds(
      'resonator',
      { ...cue, actor: 'player', reflected: 1, enemyHealed: 0 },
      160
    ),
    [{ name: 'trial-feedback', delay: 315 }]
  );
  assert.equal(
    getConstructSounds('noise', { ...cue, enemyMoveName: '宽带噪声' }, 72)[0]
      .name,
    'trial-noise-wide'
  );
  assert.equal(
    getConstructSounds('noise', { ...cue, enemyMoveName: '尖峰干扰' }, 160)[0]
      .name,
    'trial-noise-spike'
  );
  assert.equal(
    getConstructSounds(
      'resonator',
      { ...cue, enemyMoveName: '断电校准' },
      72
    )[0].name,
    'trial-cutoff'
  );
  assert.equal(
    getConstructSounds('defense', { ...cue, enemyMoveName: '结业劫雷' }, 160)[0]
      .name,
    'trial-thunder'
  );
  assert.deepEqual(getConstructSounds('calculus', cue, 72), []);
});

test('新增合成声实时尊重音效关闭与音量，音量零不会创建声音节点', () => {
  const originalWindow = globalThis.window;
  const originalStorage = globalThis.localStorage;
  const peaks = [];
  const starts = [];
  let settings = { soundEnabled: false, soundVolume: 100 };
  const parameter = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  class FakeAudioContext {
    currentTime = 0;
    sampleRate = 8000;
    destination = {};
    createOscillator() {
      return {
        frequency: parameter,
        connect() {},
        start() {
          starts.push('tone');
        },
        stop() {},
      };
    }
    createGain() {
      return {
        gain: {
          setValueAtTime(v) {
            peaks.push(v);
          },
          exponentialRampToValueAtTime() {},
        },
        connect(node) {
          return node;
        },
      };
    }
    createBuffer() {
      return {
        getChannelData() {
          return new Float32Array(2240);
        },
      };
    }
    createBufferSource() {
      return {
        connect(node) {
          return node;
        },
        start() {
          starts.push('noise');
        },
        stop() {},
      };
    }
    createBiquadFilter() {
      return {
        frequency: {},
        connect(node) {
          return node;
        },
      };
    }
  }
  globalThis.window = { AudioContext: FakeAudioContext };
  globalThis.localStorage = {
    getItem() {
      return JSON.stringify(settings);
    },
  };
  try {
    playSound('trial-thunder');
    assert.equal(starts.length, 0);
    settings = { soundEnabled: true, soundVolume: 0 };
    playSound('trial-ring');
    assert.equal(starts.length, 0);
    settings = { soundEnabled: true, soundVolume: 100 };
    for (const name of [
      'trial-ring',
      'trial-feedback',
      'trial-cutoff',
      'trial-noise-wide',
      'trial-noise-spike',
      'trial-repair',
      'trial-thunder',
    ])
      playSound(name);
    assert.ok(starts.includes('tone') && starts.includes('noise'));
    assert.ok(peaks.every((v) => v > 0 && v <= 0.2));
    peaks.length = 0;
    settings.soundVolume = 25;
    playSound('trial-ring');
    assert.equal(peaks[0], 0.15 * 0.25);
    const previousStarts = starts.length;
    settings.soundEnabled = false;
    playSound('trial-feedback');
    assert.equal(starts.length, previousStarts);
  } finally {
    globalThis.window = originalWindow;
    globalThis.localStorage = originalStorage;
  }
});
