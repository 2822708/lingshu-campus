import { useState, useEffect, useCallback, useMemo } from 'react';
import { PlayerStats, LogEntry, GameSettings } from '../types';
import { createInitialPlayer } from '../utils/playerUtils';
import { SAVE_KEY, SETTINGS_KEY } from '../utils/gameUtils';
import { ensureUid, extractUidFromName, releaseUid } from '../utils/uidApi';
import {
  createGameSave,
  isSaveCompatible,
  restoreSavedPlayer,
} from '../features/save/saveCodec';
import { createAutoSaveScheduler } from '../features/save/autoSaveScheduler';
import { TALENTS } from '../constants';
import { getNpuTalent } from '../npu-data';
import { CAMPUS_THEME } from '../config/campusTheme';

/** 当前屏幕状态 */
export type Screen = 'home' | 'create' | 'playing';

export function useGameState() {
  // 检查是否有可用存档（决定首页是否显示"继续游戏"）
  const [hasSave, setHasSave] = useState(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      if (isSaveCompatible(JSON.parse(raw))) return true;
      // 老版本存档直接清掉，免得首页读出一堆 undefined
      localStorage.removeItem(SAVE_KEY);
      return false;
    } catch {
      return false;
    }
  });

  // 当前屏幕：home（首页）→ create（创建角色）→ playing（游戏中）
  const [screen, setScreen] = useState<Screen>('home');

  const [player, setPlayer] = useState<PlayerStats | null>(null);

  const [settings, setSettings] = useState<GameSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        return { ...JSON.parse(saved) };
      }
    } catch {
      // 读取失败时沿用下方的默认设置。
    }
    return {
      soundEnabled: true,
      musicEnabled: true,
      soundVolume: 70,
      musicVolume: 50,
      autoSave: true,
      animationSpeed: 'normal',
      language: 'zh',
    };
  });

  const [logs, setLogs] = useState<LogEntry[]>([]);

  // 设置持久化独立于玩家自动存档，关闭自动保存后也应记住音效等选择。
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('保存设置失败:', error);
    }
  }, [settings]);

  // 兼容 setGameStarted 接口（App.tsx 中 DeathModal 的 handleRebirth 会用到）
  const gameStarted = screen === 'playing';
  const setGameStarted = useCallback((playing: boolean) => {
    setScreen(playing ? 'playing' : 'home');
  }, []);

  /** 加载存档（供 HomeScreen 的"继续游戏"调用） */
  const handleContinueGame = useCallback(async () => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) {
        console.warn('没有存档可加载');
        return;
      }
      const savedData = JSON.parse(raw);
      if (!isSaveCompatible(savedData)) {
        localStorage.removeItem(SAVE_KEY);
        setHasSave(false);
        alert('这份存档是旧版本的，读不了，已自动清除。请重新开始。');
        return;
      }
      // 老存档（没 UID 的名字）：自动补一个 UID，防重名
      const rawName = savedData.player.name || '无名同学';
      const newName = await ensureUid(rawName);

      const loadedPlayer = restoreSavedPlayer(savedData.player, newName);
      setPlayer(loadedPlayer);
      setLogs(savedData.logs || []);
      setScreen('playing');
    } catch (error) {
      console.error('加载存档失败:', error);
      setHasSave(false);
      alert('存档已损坏，已自动清除。请重新开始游戏。');
      localStorage.removeItem(SAVE_KEY);
    }
  }, []);

  /** 删除存档（供 HomeScreen 的"删除存档"调用） */
  const handleDeleteSave = useCallback(() => {
    try {
      // 释放 UID（删档后编号给别人复用）
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        const uid = extractUidFromName(saved?.player?.name || '');
        if (uid) {
          releaseUid(uid); // 静默异步，不阻塞
        }
      }
      localStorage.removeItem(SAVE_KEY);
      setHasSave(false);
      setPlayer(null);
      setLogs([]);
      setScreen('home');
    } catch (error) {
      console.error('删除存档失败:', error);
    }
  }, []);

  /** 返回首页（游戏中"退出"用，目前未挂载按钮，保留备用） */
  const handleBackToHome = useCallback(() => {
    setScreen('home');
    setPlayer(null);
    setLogs([]);
  }, []);

  // 保存存档
  const saveGame = useCallback(
    (playerData: PlayerStats, logsData: LogEntry[]) => {
      try {
        const saveData = createGameSave(playerData, logsData);
        localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
        setHasSave(true);
      } catch (error) {
        console.error('保存存档失败:', error);
      }
    },
    []
  );

  // 开始新游戏（从 StartScreen 完成时调用）
  const handleStartGame = useCallback(
    async (playerName: string, talentId: string) => {
      // 分配唯一 UID 拼到名字后，防重名（`名字#XXXX`）
      const fullName = await ensureUid(playerName.trim());
      const newPlayer = createInitialPlayer(fullName, talentId);
      const initialTalent =
        TALENTS.find((t) => t.id === talentId) || getNpuTalent(talentId);
      const initialLogs: LogEntry[] = [
        {
          id: `${Date.now()}-1-${Math.random().toString(36).substr(2, 9)}`,
          text: CAMPUS_THEME.welcome,
          type: 'special',
          timestamp: Date.now(),
        },
        {
          id: `${Date.now()}-2-${Math.random().toString(36).substr(2, 9)}`,
          text: `你天生拥有【${initialTalent?.name}】天赋。${initialTalent?.description}`,
          type: 'special',
          timestamp: Date.now(),
        },
      ];
      setPlayer(newPlayer);
      setLogs(initialLogs);
      setScreen('playing');
      saveGame(newPlayer, initialLogs);
    },
    [saveGame]
  );

  // 状态更新只替换待保存快照；持续自习/回血时也不会无限推迟落盘。
  const autoSaveScheduler = useMemo(
    () =>
      createAutoSaveScheduler(
        ({ player, logs }: { player: PlayerStats; logs: LogEntry[] }) =>
          saveGame(player, logs)
      ),
    [saveGame]
  );

  useEffect(() => () => autoSaveScheduler.cancel(), [autoSaveScheduler]);

  useEffect(() => {
    if (player && screen === 'playing' && settings.autoSave) {
      autoSaveScheduler.schedule({ player, logs });
    } else {
      autoSaveScheduler.cancel();
    }
  }, [player, logs, settings.autoSave, autoSaveScheduler, screen]);

  return {
    // 屏幕状态
    screen,
    setScreen,
    // 兼容旧 API
    gameStarted,
    setGameStarted,
    // 玩家数据
    hasSave,
    player,
    setPlayer,
    settings,
    setSettings,
    logs,
    setLogs,
    // 操作
    handleStartGame,
    handleContinueGame,
    handleDeleteSave,
    handleBackToHome,
    saveGame,
  };
}
