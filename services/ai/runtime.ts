import {
  getAIConfig,
  resolveUserAIConfig,
  validateAIConfig,
} from '../../config/aiConfig';
import type { AIConfig } from '../../config/aiConfig';
import type { UserAIConfig } from '../../config/userAIConfig';
import { buildSkillRequest, parseSkillOutput } from '../../features/ai/skills';
import type {
  GameAISkillId,
  SkillInputMap,
  SkillOutputMap,
} from '../../features/ai/skills';
import { requestAI } from './client';

let contextEpoch = 0;
const pending = new Set<AbortController>();
let subscribed = false;

export class AIContextCancelledError extends Error {
  constructor() {
    super('游戏上下文已变化，本次生成已取消。');
    this.name = 'AIContextCancelledError';
  }
}

export function getAIContextEpoch(): number {
  return contextEpoch;
}

export function isAIContextCurrent(epoch: number): boolean {
  return epoch === contextEpoch;
}

/** 读档、角色重建或离开游戏时调用；旧请求不能继续结算。 */
export function cancelGameAI(): void {
  contextEpoch += 1;
  for (const controller of pending) controller.abort();
}

function subscribeToConfigChanges(): void {
  if (subscribed || typeof window === 'undefined') return;
  const abortPending = () => {
    // 配置变化只取消文案请求；同一次行动继续使用已经固定的本地结果。
    for (const controller of pending) controller.abort();
  };
  window.addEventListener('lingshu-ai-config-changed', abortPending);
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key === 'npu-user-ai-config')
      abortPending();
  });
  subscribed = true;
}

export async function runGameAISkill<K extends GameAISkillId>(
  id: K,
  input: SkillInputMap[K],
  options: { config?: AIConfig; signal?: AbortSignal } = {}
): Promise<SkillOutputMap[K]> {
  subscribeToConfigChanges();
  const config = options.config || getAIConfig();
  const validation = validateAIConfig(config);
  if (!validation.valid) throw new Error(validation.error || 'AI 配置无效。');
  // 初版采用繁忙即本地回退，不为自动操作积累付费请求队列。
  if (pending.size >= 1)
    throw new Error('已有生成正在进行，本次使用本地文案。');
  const controller = new AbortController();
  const epoch = contextEpoch;
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  pending.add(controller);
  try {
    const response = await requestAI(config, buildSkillRequest(id, input), {
      signal: controller.signal,
    });
    if (!isAIContextCurrent(epoch)) throw new AIContextCancelledError();
    if (controller.signal.aborted) throw new Error('本次生成已取消。');
    return parseSkillOutput(id, response.text);
  } catch (error) {
    if (!isAIContextCurrent(epoch)) throw new AIContextCancelledError();
    throw error;
  } finally {
    pending.delete(controller);
    options.signal?.removeEventListener('abort', abort);
  }
}

/** 使用业务相同的事件文案协议；不创建角色、消耗资源或保存当前草稿。 */
export async function testAIConnection(
  draft: UserAIConfig,
  signal?: AbortSignal
): Promise<{ ok: boolean; message: string; latencyMs?: number }> {
  const started = performance.now();
  try {
    await runGameAISkill(
      'adventure',
      {
        realm: '大一',
        adventureType: 'normal',
        location: '研习室',
        localStory: '你在研习室整理了今天的笔记。',
        outcome: { hpChange: 0, expChange: 0, spiritStonesChange: 0 },
      },
      { config: resolveUserAIConfig({ ...draft, enabled: true }), signal }
    );
    return {
      ok: true,
      message: '当前表单的事件文案生成通过；尚未保存，也未改变游戏进度。',
      latencyMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : '生成测试失败，请检查配置。',
      latencyMs: Math.round(performance.now() - started),
    };
  }
}
