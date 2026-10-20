import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { PlayerStats, LogEntry, GameSettings } from '../types';
import { createInitialPlayer } from '../utils/playerUtils';
import { SAVE_KEY, SETTINGS_KEY } from '../utils/gameUtils';
import { ensureUid, extractUidFromName, releaseUid } from '../utils/uidApi';
import {
  createGameSave,
  isSaveCompatible,
  restoreSavedPlayer,
  type GameSave,
} from '../features/save/saveCodec';
import { createAutoSaveScheduler } from '../features/save/autoSaveScheduler';
import { TALENTS } from '../constants';
import { getNpuTalent } from '../npu-data';
import { CAMPUS_THEME } from '../config/campusTheme';
import {
  claimSaveOwnership,
  supportsSaveOwnership,
} from '../features/save/saveOwner';
import {
  assertInteractiveProgress,
  emptyInteractiveProgress,
  reduceInteractiveAction,
  type InteractiveCommand,
  type InteractiveProgress,
} from '../features/interactive/state';
import {
  cancelGameAI,
  getAIContextEpoch,
  isAIContextCurrent,
} from '../services/ai/runtime';

/** 当前屏幕状态 */
export type Screen = 'home' | 'create' | 'playing';

export function useGameState() {
  // 检查是否有可用存档（决定首页是否显示"继续游戏"）
  const [hasSave, setHasSave] = useState(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      if (isSaveCompatible(JSON.parse(raw))) return true;
      // Keep incompatible data available for backup instead of deleting it on inspection.
      return false;
    } catch {
      return false;
    }
  });

  // 当前屏幕：home（首页）→ create（创建角色）→ playing（游戏中）
  const [screen, setScreen] = useState<Screen>('home');

  const [player, rawSetPlayer] = useState<PlayerStats | null>(null);

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

  const [logs, rawSetLogs] = useState<LogEntry[]>([]);
  const [interactive, setInteractive] = useState<InteractiveProgress>(
    emptyInteractiveProgress
  );
  const [saveError, setSaveError] = useState('');
  const interactiveRef = useRef(interactive);
  const playerRef = useRef(player);
  const logsRef = useRef(logs);
  const ownerRelease = useRef<(() => void) | null>(null);
  const ownerGeneration = useRef(0);
  const mounted = useRef(true);
  const ownerRequest = useRef<Promise<boolean> | null>(null);
  const writesSuspended = useRef(false);
  const schedulerRef = useRef<{ cancel: () => void } | null>(null);
  interactiveRef.current = interactive;
  playerRef.current = player;
  logsRef.current = logs;

  const ownsSave = useCallback(
    () => !supportsSaveOwnership() || Boolean(ownerRelease.current),
    []
  );
  const ensureOwnership = useCallback(async () => {
    if (!supportsSaveOwnership() || ownerRelease.current) return true;
    if (!ownerRequest.current) {
      const generation = ownerGeneration.current;
      const request: Promise<boolean> = claimSaveOwnership()
        .then((release) => {
          if (!mounted.current || ownerGeneration.current !== generation) {
            release?.();
            return false;
          }
          ownerRelease.current = release;
          if (!release)
            setSaveError(
              '此存档已在另一个页面打开，请先关闭那个游戏页面再重试。'
            );
          return Boolean(release);
        })
        .catch(() => {
          if (mounted.current)
            setSaveError('暂时无法取得存档写入权限，请重试。');
          return false;
        })
        .finally(() => {
          if (ownerRequest.current === request) ownerRequest.current = null;
        });
      ownerRequest.current = request;
    }
    return ownerRequest.current;
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      ownerGeneration.current += 1;
      ownerRequest.current = null;
      ownerRelease.current?.();
      ownerRelease.current = null;
    };
  }, []);

  // A pending encounter freezes external gameplay writes, including late timer callbacks.
  const setPlayer: Dispatch<SetStateAction<PlayerStats | null>> = useCallback(
    (update) => {
      if (
        writesSuspended.current ||
        interactiveRef.current.pending ||
        !ownsSave()
      )
        return;
      const next =
        typeof update === 'function' ? update(playerRef.current) : update;
      playerRef.current = next;
      rawSetPlayer(next);
    },
    [ownsSave]
  );
  const setLogs: Dispatch<SetStateAction<LogEntry[]>> = useCallback(
    (update) => {
      if (
        writesSuspended.current ||
        interactiveRef.current.pending ||
        !ownsSave()
      )
        return;
      const next =
        typeof update === 'function' ? update(logsRef.current) : update;
      logsRef.current = next;
      rawSetLogs(next);
    },
    [ownsSave]
  );

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
    cancelGameAI();
    schedulerRef.current?.cancel();
    const actionEpoch = getAIContextEpoch();
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) {
        console.warn('没有存档可加载');
        return;
      }
      const savedData = JSON.parse(raw);
      if (!isSaveCompatible(savedData)) {
        setHasSave(false);
        setSaveError('这份存档版本不兼容，原数据已保留。');
        return;
      }
      // 老存档（没 UID 的名字）：自动补一个 UID，防重名
      const rawName = savedData.player.name || '无名同学';
      const newName = await ensureUid(rawName);
      if (!isAIContextCurrent(actionEpoch)) return;
      if (supportsSaveOwnership() && !(await ensureOwnership())) return;
      if (!isAIContextCurrent(actionEpoch)) return;
      if (localStorage.getItem(SAVE_KEY) !== raw)
        throw new Error('等待期间存档发生变化，请重新继续游戏。');
      const progress =
        savedData.interactive === undefined
          ? emptyInteractiveProgress()
          : savedData.interactive;
      assertInteractiveProgress(progress);
      if (savedData.logs !== undefined && !Array.isArray(savedData.logs))
        throw new Error('存档日志无效。');

      const loadedPlayer = restoreSavedPlayer(savedData.player, newName);
      interactiveRef.current = progress;
      setInteractive(progress);
      playerRef.current = loadedPlayer;
      logsRef.current = savedData.logs || [];
      rawSetPlayer(loadedPlayer);
      rawSetLogs(logsRef.current);
      setSaveError('');
      writesSuspended.current = false;
      setScreen('playing');
    } catch (error) {
      if (!isAIContextCurrent(actionEpoch)) return;
      console.error('加载存档失败:', error);
      setHasSave(false);
      setSaveError('存档未能加载，原数据已保留。请备份后检查机缘记录或重试。');
    }
  }, [ensureOwnership]);

  /** 删除存档（供 HomeScreen 的"删除存档"调用） */
  const handleDeleteSave = useCallback(async () => {
    cancelGameAI();
    schedulerRef.current?.cancel();
    if (supportsSaveOwnership() && !(await ensureOwnership())) return;
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
      interactiveRef.current = emptyInteractiveProgress();
      setInteractive(interactiveRef.current);
      playerRef.current = null;
      logsRef.current = [];
      rawSetPlayer(null);
      rawSetLogs([]);
      ownerGeneration.current += 1;
      ownerRequest.current = null;
      ownerRelease.current?.();
      ownerRelease.current = null;
      setScreen('home');
    } catch (error) {
      console.error('删除存档失败:', error);
    }
  }, [ensureOwnership]);

  /** 返回首页（游戏中"退出"用，目前未挂载按钮，保留备用） */
  const handleBackToHome = useCallback(() => {
    cancelGameAI();
    schedulerRef.current?.cancel();
    setScreen('home');
    rawSetPlayer(null);
    rawSetLogs([]);
    ownerGeneration.current += 1;
    ownerRequest.current = null;
    ownerRelease.current?.();
    ownerRelease.current = null;
  }, []);

  // 保存存档
  const saveGame = useCallback(
    (playerData: PlayerStats, logsData: LogEntry[]) => {
      try {
        if (
          writesSuspended.current ||
          interactiveRef.current.pending ||
          !ownsSave() ||
          playerData !== playerRef.current ||
          logsData !== logsRef.current
        )
          return false;
        const saveData = createGameSave(
          playerData,
          logsData,
          Date.now(),
          interactiveRef.current
        );
        localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
        setHasSave(true);
        setSaveError('');
        return true;
      } catch (error) {
        console.error('保存存档失败:', error);
        setSaveError('保存失败，请检查浏览器存储空间。');
        return false;
      }
    },
    [ownsSave]
  );

  // 开始新游戏（从 StartScreen 完成时调用）
  const handleStartGame = useCallback(
    async (playerName: string, talentId: string) => {
      cancelGameAI();
      schedulerRef.current?.cancel();
      const actionEpoch = getAIContextEpoch();
      // 分配唯一 UID 拼到名字后，防重名（`名字#XXXX`）
      const fullName = await ensureUid(playerName.trim());
      if (!isAIContextCurrent(actionEpoch)) return;
      if (supportsSaveOwnership() && !(await ensureOwnership())) return;
      if (!isAIContextCurrent(actionEpoch)) return;
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
      interactiveRef.current = emptyInteractiveProgress();
      writesSuspended.current = false;
      setInteractive(interactiveRef.current);
      playerRef.current = newPlayer;
      logsRef.current = initialLogs;
      rawSetPlayer(newPlayer);
      rawSetLogs(initialLogs);
      setScreen('playing');
      saveGame(newPlayer, initialLogs);
    },
    [saveGame, ensureOwnership]
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
  schedulerRef.current = autoSaveScheduler;

  useEffect(() => () => autoSaveScheduler.cancel(), [autoSaveScheduler]);
  useEffect(() => () => cancelGameAI(), []);

  useEffect(() => {
    if (
      player &&
      screen === 'playing' &&
      settings.autoSave &&
      !interactive.pending
    ) {
      autoSaveScheduler.schedule({ player, logs });
    } else {
      autoSaveScheduler.cancel();
    }
  }, [player, logs, settings.autoSave, autoSaveScheduler, screen, interactive]);

  const commitInteractive = useCallback(
    (command: InteractiveCommand) => {
      if (!playerRef.current || writesSuspended.current) return false;
      try {
        if (!supportsSaveOwnership() || !ownsSave()) {
          throw new Error(
            '互动机缘需要支持页面存档锁的浏览器，请使用最新版浏览器并在本地或 HTTPS 页面打开。'
          );
        }
        const snapshot = {
          player: playerRef.current,
          logs: logsRef.current,
          interactive: interactiveRef.current,
        };
        const next = reduceInteractiveAction(snapshot, command);
        if (next === snapshot) return false;
        autoSaveScheduler.cancel();
        if (command.type === 'begin') cancelGameAI();
        // Write first. A quota error leaves all in-memory state and the RNG untouched.
        localStorage.setItem(
          SAVE_KEY,
          JSON.stringify(
            createGameSave(next.player, next.logs, Date.now(), next.interactive)
          )
        );
        playerRef.current = next.player;
        logsRef.current = next.logs;
        interactiveRef.current = next.interactive;
        rawSetPlayer(next.player);
        rawSetLogs(next.logs);
        setInteractive(next.interactive);
        setHasSave(true);
        setSaveError('');
        return true;
      } catch (error) {
        setSaveError(
          error instanceof Error ? error.message : '本次记录未能保存，请重试。'
        );
        return false;
      }
    },
    [autoSaveScheduler, ownsSave]
  );

  const importGameSave = useCallback(
    (saved: GameSave) => {
      if (!ownsSave() || interactiveRef.current.pending)
        throw new Error('请先处理当前机缘，再导入存档。');
      autoSaveScheduler.cancel();
      cancelGameAI();
      localStorage.setItem(SAVE_KEY, JSON.stringify(saved));
      writesSuspended.current = true;
    },
    [autoSaveScheduler, ownsSave]
  );

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
    interactive,
    saveError,
    commitInteractive,
    importGameSave,
  };
}
