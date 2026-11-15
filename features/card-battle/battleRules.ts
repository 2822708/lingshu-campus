import { CARD_FOCUS_PER_TURN, CARD_HAND_LIMIT, CARD_MAX_VALUE } from './shared';
import type { BattleRule, BattleRuleEffect, CardBattleState } from './types';

const timingLabels = {
  opening: '首回合',
  even: '偶数回合',
  odd: '奇数回合',
  late: '第3回合起',
  'below-half': '对手精力不超过一半时',
};

const checkLabels = {
  attacks: '本轮伤害牌数',
  block: '当前防护',
  focus: '剩余专注',
  hand: '结算手牌数',
  guard: '对手固守剩余回合',
  injury: '入场以来净损精力',
  defenses: '本轮防御牌数',
};

const channelLabels = {
  damage: '来袭',
  pierce: '穿透率',
  heal: '对手修复上限',
};

function boundedInteger(value: unknown, min: number, max: number): boolean {
  return (
    value === undefined ||
    (typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= min &&
      value <= max)
  );
}

export function assertBattleRules(
  value: unknown
): asserts value is BattleRule[] | undefined {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length < 1 || value.length > 2)
    throw new Error('卡牌战斗存档无效：考核规则数量');

  const checkMax = {
    attacks: 100000,
    block: CARD_MAX_VALUE,
    focus: CARD_FOCUS_PER_TURN,
    hand: CARD_HAND_LIMIT,
    guard: 2,
    injury: CARD_MAX_VALUE,
    defenses: 100000,
  };
  for (const rule of value) {
    if (
      !rule ||
      typeof rule !== 'object' ||
      typeof rule.label !== 'string' ||
      !rule.label.trim() ||
      rule.label.length > 80 ||
      typeof rule.check !== 'string' ||
      !Object.hasOwn(checkLabels, rule.check) ||
      (rule.timing !== undefined &&
        (typeof rule.timing !== 'string' ||
          !Object.hasOwn(timingLabels, rule.timing))) ||
      (rule.channel !== undefined &&
        (typeof rule.channel !== 'string' ||
          !Object.hasOwn(channelLabels, rule.channel))) ||
      (rule.min === undefined && rule.max === undefined) ||
      !boundedInteger(
        rule.min,
        0,
        checkMax[rule.check as BattleRule['check']]
      ) ||
      !boundedInteger(
        rule.max,
        0,
        checkMax[rule.check as BattleRule['check']]
      ) ||
      (rule.min ?? 0) > (rule.max ?? CARD_MAX_VALUE) ||
      !boundedInteger(rule.pass, -100, 100) ||
      !boundedInteger(rule.fail, -100, 100) ||
      (rule.pass ?? 0) === (rule.fail ?? 0)
    )
      throw new Error('卡牌战斗存档无效：考核规则定义');
  }
}

export function describeBattleRule(rule: BattleRule): string {
  const { min, max, timing, channel = 'damage', pass = 0, fail = 0 } = rule;
  const condition =
    min === undefined
      ? `至多 ${max}`
      : max === undefined
        ? `至少 ${min}`
        : min === max
          ? `恰好 ${min}`
          : `介于 ${min} 和 ${max}`;
  const format = (delta: number) =>
    `${channelLabels[channel]}${delta > 0 ? '+' : ''}${delta}${channel === 'pierce' ? ' 个百分点' : ''}`;
  const effects = [
    pass ? `达标时${format(pass)}` : '',
    fail ? `未达标时${format(fail)}` : '',
  ].filter(Boolean);
  return `${timing ? `${timingLabels[timing]}，` : ''}${checkLabels[rule.check]}${condition}。${effects.join('，')}。`;
}

export function applyBattleRules(
  state: CardBattleState,
  incoming: number
): {
  values: Record<BattleRuleEffect['channel'], number>;
  effects?: BattleRuleEffect[];
} {
  const values = {
    damage: incoming,
    pierce: state.intent.piercePercent ?? 0,
    heal: state.intent.heal ?? 0,
  };
  if (!state.enemy.rules) return { values };

  const { player, enemy, turn } = state;
  const checks = {
    attacks: player.attacksPlayed,
    block: player.block,
    focus: player.energy,
    hand: Math.min(state.hand.length, CARD_HAND_LIMIT),
    guard: enemy.guardRounds,
    injury: player.entryHp - player.hp,
    defenses: player.defensesPlayed ?? 0,
  };
  const timings = {
    opening: turn === 1,
    even: turn % 2 === 0,
    odd: turn % 2 !== 0,
    late: turn >= 3,
    'below-half': enemy.hp * 2 <= enemy.maxHp,
  };
  const effects = enemy.rules.map((rule) => {
    const { label, timing, check, channel = 'damage' } = rule;
    const active = timing === undefined || timings[timing];
    const value = checks[check];
    const met =
      value >= (rule.min ?? 0) && value <= (rule.max ?? CARD_MAX_VALUE);
    const base = values[channel];
    const change = active ? (met ? (rule.pass ?? 0) : (rule.fail ?? 0)) : 0;
    values[channel] = Math.min(
      channel === 'pierce' ? 100 : CARD_MAX_VALUE,
      Math.max(0, base + change)
    );
    return {
      label,
      hint: describeBattleRule(rule),
      active,
      met,
      channel,
      delta: values[channel] - base,
    };
  });
  return { values, effects };
}
