import { assertTrialState } from './engine';
import type { TrialState } from './types';

export const TRIAL_SAVE_KEY = 'lingshu-card-trial-v1';
export type TrialStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function loadTrial(storage: TrialStorage): {
  state: TrialState | null;
  error: string;
} {
  try {
    const raw = storage.getItem(TRIAL_SAVE_KEY);
    if (raw === null) return { state: null, error: '' };
    const state: unknown = JSON.parse(raw);
    assertTrialState(state);
    return { state, error: '' };
  } catch {
    return {
      state: null,
      error: '独立试炼记录无法读取。原记录已保留，可显式开始新试炼。',
    };
  }
}

/** 仅写原型专用键；先落盘再由界面公布结果，不接触主游戏存档。 */
export function commitTrial(
  storage: TrialStorage,
  previous: TrialState | null,
  next: TrialState
): { ok: boolean; error?: string } {
  try {
    assertTrialState(next);
    if (previous) {
      const raw = storage.getItem(TRIAL_SAVE_KEY);
      if (
        raw === null ||
        JSON.stringify(JSON.parse(raw)) !== JSON.stringify(previous)
      ) {
        return {
          ok: false,
          error: '试炼记录已被其他页面修改，请刷新后继续。本次操作未写入。',
        };
      }
      const restarting = next.runId !== previous.runId;
      if (
        restarting
          ? next.commandSeq !== 0 || next.stage !== 0 || next.phase !== 'battle'
          : next.commandSeq !== previous.commandSeq + 1
      ) {
        return { ok: false, error: '指令已经处理或顺序无效，本次操作未写入。' };
      }
    } else {
      // 无效旧档只在用户明确开始新试炼时覆盖；读取本身从不删除或改写。
      if (loadTrial(storage).state) {
        return {
          ok: false,
          error: '已有有效试炼记录，请刷新后继续，或从记录页确认重新开始。',
        };
      }
      if (
        next.commandSeq !== 0 ||
        next.stage !== 0 ||
        next.phase !== 'battle'
      ) {
        return { ok: false, error: '需要先建立新的独立试炼。' };
      }
    }
    storage.setItem(TRIAL_SAVE_KEY, JSON.stringify(next));
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: '本次操作未能保存，现场没有推进。请检查浏览器存储后重试。',
    };
  }
}
