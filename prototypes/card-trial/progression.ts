import { REALM_DATA, REALM_ORDER } from '../../constants';
import { generateInteractiveEnemy } from '../../features/interactive/battle';
import { ENEMIES } from './catalog';
import type {
  CardDefinition,
  TrialAttribute,
  TrialEnemy,
  TrialProfile,
  TrialState,
} from './types';

const STRENGTHS = [
  { label: '弱敌', multiplier: 0.7 },
  { label: '普通', multiplier: 0.9 },
  { label: '强敌', multiplier: 1.1 },
] as const;
const BASE_ATTRIBUTES = {
  attack: 'baseAttack',
  defense: 'baseDefense',
  spirit: 'baseSpirit',
  physique: 'basePhysique',
  speed: 'baseSpeed',
} as const;
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));
const positive = (value: number) =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

function reference(profile: TrialProfile) {
  const realm = REALM_ORDER.includes(profile.realm)
    ? profile.realm
    : REALM_ORDER[0];
  const level = clamp(Math.floor(positive(profile.realmLevel)), 1, 9);
  return {
    realm,
    level,
    scale: 1 + (level - 1) * 0.1,
    base: REALM_DATA[realm],
  };
}

/** 角色数值相对同学阶、同层级基准的比例；速度使用独立速度基准。 */
export function getProfileStatRatio(
  profile: TrialProfile,
  stat: TrialAttribute
): number {
  const { base, scale } = reference(profile);
  return positive(profile[stat]) / (base[BASE_ATTRIBUTES[stat]] * scale);
}

/** 卡牌只得到当前快照的属性加成；普通基础牌不跟随角色属性膨胀。 */
export function getCardScaling(
  card: CardDefinition,
  profile?: TrialProfile
): { bonus: number; effect: 'damage' | 'block' | 'heal' | null } {
  if (!profile || !card.scaling) return { bonus: 0, effect: null };
  const { stat, coefficient, cap, effect } = card.scaling;
  return {
    bonus: clamp(
      Math.floor(getProfileStatRatio(profile, stat) * coefficient),
      0,
      cap
    ),
    effect,
  };
}

/** 精力与体能共同影响试炼精力，限制在基础值的 75% 到 200%。 */
export function getTrialMaxHp(profile?: TrialProfile): number {
  if (!profile) return 45;
  const { base, scale } = reference(profile);
  const hpRatio = positive(profile.maxHp) / (base.baseMaxHp * scale);
  const physiqueRatio = getProfileStatRatio(profile, 'physique');
  return Math.round(45 * clamp(0.8 * hpRatio + 0.2 * physiqueRatio, 0.75, 2));
}

function describeIntent(damage: number, block: number): string {
  if (damage === 0 && block === 0) return '下一次行动不攻击，也不增加防护。';
  if (damage === 0) return `下一次行动不攻击，获得 ${block} 点防护。`;
  return `下一次行动造成 ${damage} 点损耗${block > 0 ? `，并获得 ${block} 点防护` : ''}。`;
}

/** 与主游戏同学阶/层级的纯敌人生成共用基准，不读取角色装备或全局随机数。 */
export function getTrialEnemy(
  state: Pick<TrialState, 'stage' | 'seed' | 'build'>
): TrialEnemy {
  const template = ENEMIES[state.stage];
  if (!state.build) return template;
  const { realm, level, base, scale } = reference(state.build.profile);
  const strength = STRENGTHS[state.stage];
  // 固定的逐场种子只用于敌人快照；不推进抽洗牌、奖励的 rngState。
  const enemySeed = (state.seed + Math.imul(state.stage + 1, 0x9e3779b9)) >>> 0;
  const generated = generateInteractiveEnemy(
    { realm, realmLevel: level },
    enemySeed
  );
  const raw = Object.freeze({
    maxHp: Math.round(generated.maxHp * strength.multiplier),
    attack: Math.round(generated.attack * strength.multiplier),
    defense: Math.round(generated.defense * strength.multiplier),
  });
  const unit = (base.baseAttack * scale) / 10;
  const attack = Math.max(1, Math.round(raw.attack / unit));
  const defense = Math.max(1, Math.round(raw.defense / unit));
  const pattern = Object.freeze(
    template.pattern.map((intent) => {
      const damage = Math.round((intent.damage * attack) / 8);
      const block = Math.round((intent.block * defense) / 4);
      return Object.freeze({
        name: intent.name,
        damage,
        block,
        description: describeIntent(damage, block),
      });
    })
  );
  return Object.freeze({
    ...template,
    maxHp: Math.max(15, Math.round(raw.maxHp / unit)),
    pattern,
    description: `${realm} ${level} 层 · ${strength.label}。${pattern.map((intent) => `${intent.name}：${intent.description}`).join(' ')}`,
    grade: Object.freeze({
      realm,
      level,
      strength: strength.label,
      unit,
      attack,
      defense,
      raw,
    }),
  });
}
