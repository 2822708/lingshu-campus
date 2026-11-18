/**
 * Web Audio 音效系统（零素材，代码合成）
 *
 * 用法：
 *   import { playSound } from '../utils/sound';
 *   playSound('click');
 *
 * 音效类型：
 *   click    - 按钮点击（短促键盘声）
 *   confirm  - 操作成功（柔和确认）
 *   battle   - 战斗命中（打击感）
 *   levelup  - 升级/突破（上升欢快）
 *   defeat   - 延毕/失败（低沉）
 *   pickup   - 获得物品（叮）
 *
 * 尊重 settings（音效开关 + 音量）：
 *   soundEnabled / soundVolume 存在 localStorage 的 npu-game-settings 里
 *   playSound 每次调用实时读，玩家改了立刻生效
 */

// 单例 AudioContext（浏览器限制首次用户手势后才允许播放）
let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) {
    try {
      audioCtx = new AC();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

/** 读取设置（音效开关 + 音量） */
function readSettings(): { enabled: boolean; volume: number } {
  try {
    const raw = localStorage.getItem('npu-game-settings');
    if (raw) {
      const s = JSON.parse(raw);
      return {
        enabled: s.soundEnabled !== false,
        volume: Math.min(1, Math.max(0, (s.soundVolume ?? 70) / 100)),
      };
    }
  } catch {
    // ignore
  }
  return { enabled: true, volume: 0.7 };
}

/** 通用音效播放器 */
function tone(
  freqStart: number,
  freqEnd: number,
  duration: number,
  type: OscillatorType,
  volume: number,
  delay = 0
) {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t0 = ctx.currentTime + delay;

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t0);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, freqEnd),
      t0 + duration
    );

    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  } catch {
    // 忽略播放错误
  }
}

let paperNoise: AudioBuffer | null = null;

function texture(freq: number, duration: number, volume: number, delay = 0) {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    if (!paperNoise) {
      paperNoise = ctx.createBuffer(
        1,
        Math.ceil(ctx.sampleRate * 0.28),
        ctx.sampleRate
      );
      const samples = paperNoise.getChannelData(0);
      for (let i = 0; i < samples.length; i++)
        samples[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const start = ctx.currentTime + delay;

    source.buffer = paperNoise;
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(start);
    source.stop(start + duration);
  } catch {
    // 音效播放失败时保留画面反馈。
  }
}

/** 播放一个音效 */
export function playSound(
  name:
    | 'click'
    | 'confirm'
    | 'battle'
    | 'levelup'
    | 'defeat'
    | 'pickup'
    | 'trial-paper'
    | 'trial-hit'
    | 'trial-block'
    | 'trial-break'
    | 'trial-heavy'
    | 'trial-seal'
    | 'trial-ring'
    | 'trial-feedback'
    | 'trial-cutoff'
    | 'trial-noise-wide'
    | 'trial-noise-spike'
    | 'trial-repair'
    | 'trial-thunder'
) {
  const { enabled, volume } = readSettings();
  if (!enabled || volume <= 0) return;

  switch (name) {
    case 'click':
      // 键盘 click：短促方波
      tone(880, 660, 0.06, 'square', volume * 0.3);
      break;
    case 'confirm':
      // 柔和确认：两个音
      tone(523, 523, 0.1, 'sine', volume * 0.35);
      tone(659, 659, 0.12, 'sine', volume * 0.35, 0.1);
      break;
    case 'battle':
      // 打击：低频快速衰减
      tone(220, 60, 0.15, 'sawtooth', volume * 0.4);
      break;
    case 'levelup':
      // 升级：上行音阶
      tone(523, 523, 0.1, 'triangle', volume * 0.4);
      tone(659, 659, 0.1, 'triangle', volume * 0.4, 0.1);
      tone(784, 784, 0.15, 'triangle', volume * 0.4, 0.2);
      break;
    case 'defeat':
      // 延毕/失败：下行低音
      tone(300, 120, 0.5, 'sawtooth', volume * 0.4);
      tone(150, 80, 0.6, 'sine', volume * 0.35, 0.15);
      break;
    case 'pickup':
      // 获得物品：清脆叮
      tone(880, 880, 0.08, 'sine', volume * 0.4);
      tone(1320, 1320, 0.12, 'sine', volume * 0.35, 0.08);
      break;
    case 'trial-paper':
      texture(1600, 0.12, volume * 0.18);
      texture(2050, 0.09, volume * 0.12, 0.055);
      break;
    case 'trial-hit':
      tone(165, 55, 0.1, 'triangle', volume * 0.24);
      texture(1700, 0.055, volume * 0.21);
      break;
    case 'trial-block':
      tone(340, 190, 0.1, 'sine', volume * 0.15);
      texture(740, 0.07, volume * 0.16);
      break;
    case 'trial-break':
      tone(470, 110, 0.11, 'triangle', volume * 0.2);
      texture(2900, 0.15, volume * 0.25);
      texture(1210, 0.09, volume * 0.14, 0.042);
      break;
    case 'trial-heavy':
      tone(130, 48, 0.23, 'triangle', volume * 0.31);
      texture(850, 0.18, volume * 0.26);
      break;
    case 'trial-seal':
      tone(115, 69, 0.12, 'sine', volume * 0.3);
      texture(1220, 0.12, volume * 0.17);
      break;
    case 'trial-ring':
      // A copper body: low vibration with quiet inharmonic overtones.
      tone(146, 126, 0.25, 'sine', volume * 0.15);
      tone(389, 350, 0.2, 'sine', volume * 0.08);
      tone(611, 575, 0.14, 'triangle', volume * 0.04);
      break;
    case 'trial-feedback':
      // Short rising return rather than a second impact on the enemy.
      tone(155, 510, 0.095, 'triangle', volume * 0.15);
      texture(1150, 0.09, volume * 0.1);
      break;
    case 'trial-cutoff':
      tone(430, 75, 0.09, 'square', volume * 0.045);
      texture(580, 0.05, volume * 0.1);
      break;
    case 'trial-noise-wide':
      texture(560, 0.24, volume * 0.13);
      texture(1750, 0.19, volume * 0.09);
      break;
    case 'trial-noise-spike':
      texture(2350, 0.065, volume * 0.13);
      tone(1150, 330, 0.08, 'triangle', volume * 0.1);
      break;
    case 'trial-repair':
      texture(720, 0.045, volume * 0.12);
      tone(240, 360, 0.11, 'triangle', volume * 0.1);
      tone(490, 490, 0.075, 'sine', volume * 0.07, 0.045);
      break;
    case 'trial-thunder':
      texture(1700, 0.08, volume * 0.15);
      texture(260, 0.27, volume * 0.19);
      tone(105, 35, 0.27, 'triangle', volume * 0.2);
      break;
  }
}

/**
 * 解锁音频上下文（浏览器要求首次用户手势后才能播放）
 * 在 App 根部挂一个全局点击监听即可
 */
export function unlockAudio() {
  const ctx = getCtx();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}
