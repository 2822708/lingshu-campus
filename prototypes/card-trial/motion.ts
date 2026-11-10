import { CARDS } from './catalog';
import {
  getCardLabel,
  getCardPreview,
  getEnemyIntent,
  HAND_LIMIT,
} from './engine';
import type { CardId, TrialCommand, TrialState } from './types';

/** 纯展示信号，不进入存档；只有完整快照成功保存后才能交给界面。 */
export interface TrialMotion {
  key: string;
  action:
    | 'attack'
    | 'guard'
    | 'draw'
    | 'heal'
    | 'charge'
    | 'enemy-turn'
    | 'discard'
    | 'ready'
    | 'victory'
    | 'defeat'
    | 'reward'
    | 'retreat';
  actor: 'player' | 'enemy' | 'none';
  playerDamage: number;
  enemyDamage: number;
  playerBlock: number;
  enemyBlock: number;
  blocked: number;
  healed: number;
  drawn: number;
  brokeBlock: number;
  title: string;
  detail: string;
  cardId?: CardId;
  cardLabel?: string;
  outcome: 'victory' | 'defeat' | null;
}

export function createTrialMotion(
  previous: TrialState | null,
  next: TrialState,
  command?: TrialCommand
): TrialMotion | null {
  if (
    !previous ||
    !command ||
    previous === next ||
    command.runId !== previous.runId ||
    next.runId !== previous.runId ||
    next.commandSeq !== previous.commandSeq + 1 ||
    command.seq !== next.commandSeq
  )
    return null;

  const cue: TrialMotion = {
    key: `${next.runId}:${next.commandSeq}`,
    action: 'retreat',
    actor: 'none',
    playerDamage: 0,
    enemyDamage: 0,
    playerBlock: 0,
    enemyBlock: 0,
    blocked: 0,
    healed: 0,
    drawn: 0,
    brokeBlock: 0,
    title: '收起笔记，离开演练',
    detail: next.log
      .filter((entry) => entry.seq === next.commandSeq)
      .map((entry) => entry.text)
      .join(' '),
    outcome:
      next.phase === 'reward' || next.phase === 'complete'
        ? 'victory'
        : next.phase === 'defeat'
          ? 'defeat'
          : null,
  };
  if (command.type === 'cancel-discard') {
    cue.action = 'ready';
    cue.title = '返回出牌 · 敌人尚未行动';
    return cue;
  }
  if (command.type === 'end-turn' && next.phase === 'discard') {
    cue.action = 'discard';
    cue.title = `整理手牌 · 还需弃置 ${next.battle.hand.length - HAND_LIMIT} 张`;
    return cue;
  }
  if (command.type === 'choose-reward') {
    cue.action = 'reward';
    cue.title = command.cardId
      ? `新解法入手 · ${CARDS[command.cardId].name}`
      : '轻装继续，进入下一场';
    cue.healed = Math.max(0, next.player.hp - previous.player.hp);
    cue.drawn = next.battle.hand.length;
    return cue;
  }
  if (command.type === 'play') {
    const instance = previous.deck.find(
      (card) => card.id === command.cardInstanceId
    );
    if (!instance || previous.stage !== next.stage) return null;
    const card = CARDS[instance.cardId];
    const preview = getCardPreview(previous, instance.id);
    const label = getCardLabel(previous, instance.id);
    cue.cardId = card.id;
    cue.cardLabel = label;
    cue.actor = 'player';
    cue.action =
      preview.damage > 0 || card.damage
        ? 'attack'
        : preview.block > 0 || card.block
          ? 'guard'
          : preview.heal > 0 || card.heal
            ? 'heal'
            : card.nextAttackBonus
              ? 'charge'
              : 'draw';
    cue.enemyDamage = Math.max(
      0,
      previous.battle.enemyHp - next.battle.enemyHp
    );
    cue.playerBlock = Math.max(0, next.player.block - previous.player.block);
    cue.healed = Math.max(0, next.player.hp - previous.player.hp);
    cue.drawn = Math.max(
      0,
      next.battle.hand.length - previous.battle.hand.length + 1
    );
    cue.brokeBlock = card.clearEnemyBlock ? previous.battle.enemyBlock : 0;
    cue.blocked = Math.min(
      preview.damage,
      card.clearEnemyBlock ? 0 : previous.battle.enemyBlock
    );
    cue.title =
      cue.outcome === 'victory'
        ? `击破 · ${label}`
        : cue.action === 'attack'
          ? cue.enemyDamage > 0
            ? `${label} · 命中`
            : `${label} · 对手挡住了`
          : cue.action === 'guard'
            ? `${label} · 防护就位`
            : cue.action === 'heal'
              ? `${label} · 恢复精力`
              : cue.action === 'charge'
                ? `${label} · 为下一次进攻蓄势`
                : `${label} · 新手牌入手`;
    return cue;
  }
  if (command.type === 'end-turn' || command.type === 'confirm-discard') {
    if (previous.stage !== next.stage) return null;
    const intent = getEnemyIntent(previous);
    cue.action = 'enemy-turn';
    cue.actor = intent.damage > 0 ? 'enemy' : 'none';
    cue.playerDamage = Math.max(0, previous.player.hp - next.player.hp);
    cue.blocked = Math.min(previous.player.block, intent.damage);
    cue.enemyBlock = intent.block;
    const discarded =
      command.type === 'confirm-discard' ? command.cardInstanceIds.length : 0;
    const retained = previous.battle.hand.length - discarded;
    cue.drawn =
      next.phase === 'battle'
        ? Math.max(0, next.battle.hand.length - retained)
        : 0;
    cue.title =
      cue.outcome === 'defeat'
        ? '精力耗尽，演练结束'
        : cue.playerDamage > 0
          ? `对手${intent.name} · 受到 ${cue.playerDamage} 点损耗`
          : cue.blocked > 0
            ? '挡住了 · 防护接住全部来袭'
            : `对手${intent.name} · 把握下一轮机会`;
  }
  return cue;
}
