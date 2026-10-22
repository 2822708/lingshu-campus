import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { Item, ShopType, LogEntry } from './types';
import { useModalState } from './features/modal/useModalState';
import StartScreen from './components/StartScreen';
import HomeScreen from './components/HomeScreen';
import DeathModal from './components/DeathModal';
import InteractiveEncounterModal from './components/InteractiveEncounterModal';
import { BattleReplay } from './services/battleService';
import { useGameState } from './hooks/useGameState';
import { useGameEffects } from './hooks/useGameEffects';
import { useLatestRef } from './hooks/useLatestRef';
import { submitScore, isEligibleForLeaderboard } from './utils/leaderboardApi';
import { applyDemotion } from './utils/demotion';
import { playSound, unlockAudio } from './utils/sound';
import LeaderboardPanel from './components/LeaderboardPanel';
import { cancelGameAI } from './services/ai/runtime';
import type { AdventureBattleRequest } from './features/interactive/adventureBattle';

// 导入模块化的 handlers
import {
  useMeditationHandlers, // 自习
  useBreakthroughHandlers, // 升学
  useBattleHandlers, // 战斗
  useItemHandlers, // 物品
  useEquipmentHandlers, // 装备
  useCultivationHandlers, // 课程
  useAlchemyHandlers, // 咖啡配方
  useCharacterHandlers, // 角色
  useShopHandlers, // 商店
  useSettingsHandlers, // 设置
  useRealmHandlers, // 副本
  usePetHandlers, // 室友
  useLotteryHandlers, // 抽奖
  useSectHandlers, // 社团
  useAchievementHandlers, // 成就
  useAdventureHandlers, // 期末冲刺
  GameView, // 游戏视图
  ModalsContainer, // 弹窗容器
} from './views';

function App() {
  // 使用自定义hooks管理游戏状态
  const {
    screen, // 当前屏幕（home/create/playing）
    setScreen,
    hasSave, // 是否有存档
    player, // 玩家数据
    setPlayer, // 设置玩家数据
    settings, // 游戏设置
    setSettings, // 设置游戏设置
    logs, // 游戏日志
    setLogs, // 设置游戏日志
    handleStartGame, // 开始新游戏
    handleContinueGame, // 继续游戏（加载存档）
    handleDeleteSave, // 删除存档
    saveGame, // 保存存档
    interactive,
    commitInteractive,
    commitRealmEntry,
    getCurrentPlayer,
    hasPendingInteractive,
    saveError,
    importGameSave,
  } = useGameState();
  const interactiveActive = Boolean(interactive.pending);
  const interactiveActiveRef = useRef(interactiveActive);
  interactiveActiveRef.current = interactiveActive;

  // 使用自定义hooks管理游戏效果
  const { visualEffects, createAddLog, triggerVisual } = useGameEffects();
  const rawAddLog = useMemo(
    () => createAddLog(setLogs),
    [createAddLog, setLogs]
  );
  // 包装 addLog：根据日志类型触发音效（gain→pickup, special→levelup, danger→defeat）
  const addLog = useCallback(
    (text: string, type: LogEntry['type'] = 'normal') => {
      if (type === 'gain') playSound('pickup');
      else if (type === 'special') playSound('levelup');
      else if (type === 'danger') playSound('defeat');
      rawAddLog(text, type);
    },
    [rawAddLog]
  );

  // 冷却时间：不用 useState（避免每秒触发 App 重渲染）
  // 用 ref 存最新值，再用 1 秒 setTimeout 归 0
  const cooldownRef = useRef(0);
  const [cooldown, setCooldownState] = useState(0);
  const setCooldown = useCallback((v: number) => {
    cooldownRef.current = Math.max(0, v);
    setCooldownState(cooldownRef.current);
    // 1 秒后自动归零（异步计时，不放在主循环里）
    if (v > 0) {
      setTimeout(() => {
        cooldownRef.current = 0;
        setCooldownState(0);
      }, 1000);
    }
  }, []);

  const {
    modals: {
      isInventoryOpen,
      setIsInventoryOpen,
      isCultivationOpen,
      setIsCultivationOpen,
      isAlchemyOpen,
      setIsAlchemyOpen,
      isUpgradeOpen,
      setIsUpgradeOpen,
      isSectOpen,
      setIsSectOpen,
      isRealmOpen,
      setIsRealmOpen,
      isCharacterOpen,
      setIsCharacterOpen,
      isAchievementOpen,
      setIsAchievementOpen,
      isPetOpen,
      setIsPetOpen,
      isLotteryOpen,
      setIsLotteryOpen,
      isSettingsOpen,
      setIsSettingsOpen,
      isLeaderboardOpen,
      setIsLeaderboardOpen,
      isShopOpen,
      setIsShopOpen,
      isMobileSidebarOpen,
      setIsMobileSidebarOpen,
      isMobileStatsOpen,
      setIsMobileStatsOpen,
    },
    shop: { currentShop, setCurrentShop },
    upgrade: { itemToUpgrade, setItemToUpgrade },
    notifications: {
      purchaseSuccess,
      setPurchaseSuccess,
      lotteryRewards,
      setLotteryRewards,
    },
  } = useModalState();
  const [battleReplay, setBattleReplay] = useState<BattleReplay | null>(null);
  const [isBattleModalOpen, setIsBattleModalOpen] = useState(false);
  const [revealedBattleRounds, setRevealedBattleRounds] = useState(0);

  const [loading, setLoading] = useState(false); // 加载状态
  const [itemActionLog, setItemActionLog] = useState<{
    text: string;
    type: string;
  } | null>(null); // 物品操作轻提示
  const [autoMeditate, setAutoMeditate] = useState(false); // 自动自习
  const [autoAdventure, setAutoAdventure] = useState(false); // 自动期末冲刺
  const [isDead, setIsDead] = useState(false); // 是否死亡
  const [deathBattleData, setDeathBattleData] = useState<BattleReplay | null>(
    null
  ); // 死亡时的战斗数据
  const [deathReason, setDeathReason] = useState(''); // 死亡原因
  const [lastBattleReplay, setLastBattleReplay] = useState<BattleReplay | null>(
    null
  ); // 最近的战斗数据

  // 初始化所有模块化的 handlers
  const battleHandlers = useBattleHandlers({
    battleReplay,
    setBattleReplay,
    isBattleModalOpen,
    setIsBattleModalOpen,
    revealedBattleRounds,
    setRevealedBattleRounds,
    animationSpeed: settings.animationSpeed,
  });

  const meditationHandlers = useMeditationHandlers({
    player,
    setPlayer,
    addLog,
    checkLevelUp: () => {}, // 检查升级逻辑在 useEffect 中处理
  });

  const breakthroughHandlers = useBreakthroughHandlers({
    player,
    setPlayer,
    addLog,
    setLoading,
    loading,
  });

  const itemHandlers = useItemHandlers({
    player,
    setPlayer,
    addLog,
    setItemActionLog,
  });

  const equipmentHandlers = useEquipmentHandlers({
    player,
    setPlayer,
    addLog,
    setItemActionLog,
  });

  const cultivationHandlers = useCultivationHandlers({
    player,
    setPlayer,
    addLog,
  });

  const alchemyHandlers = useAlchemyHandlers({
    player,
    setPlayer,
    addLog,
  });

  const characterHandlers = useCharacterHandlers({
    player,
    setPlayer,
    addLog,
  });

  // 初始化新的模块化 handlers
  const shopHandlers = useShopHandlers({
    player,
    setPlayer,
    addLog,
    currentShop,
    setCurrentShop,
    setIsShopOpen,
    setPurchaseSuccess,
  });

  const settingsHandlers = useSettingsHandlers({
    setSettings,
  });

  const petHandlers = usePetHandlers({
    player,
    setPlayer,
    addLog,
  });

  const lotteryHandlers = useLotteryHandlers({
    player,
    setPlayer,
    addLog,
    setLotteryRewards,
  });

  const startBattle = (request: AdventureBattleRequest) => {
    if (interactiveActiveRef.current || isDead) return false;
    // Automatic travel stops at the decision point, including a failed save.
    setAutoMeditate(false);
    setAutoAdventure(false);
    const started = commitInteractive({
      type: 'begin-battle',
      id: `battle-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      seed: Math.floor(Math.random() * 0x100000000),
      request,
    });
    setLoading(false);
    if (started) {
      interactiveActiveRef.current = true;
      setLastBattleReplay(null);
      setBattleReplay(null);
      setIsBattleModalOpen(false);
      setIsRealmOpen(false);
      setIsSectOpen(false);
      playSound('battle');
      setCooldown(1);
    }
    return started;
  };

  const sectHandlers = useSectHandlers({
    player,
    setPlayer,
    addLog,
    setIsSectOpen,
    setPurchaseSuccess,
    onStartBattle: startBattle,
    getCurrentPlayer,
    isInteractionPending: hasPendingInteractive,
  });

  const achievementHandlers = useAchievementHandlers({
    player,
    setPlayer,
    addLog,
  });

  // 冒险相关逻辑抽离到 useAdventureHandlers
  const adventureHandlers = useAdventureHandlers({
    player,
    setPlayer,
    addLog,
    triggerVisual,
    setLoading,
    setCooldown,
    loading,
    cooldown,
    onOpenShop: (shopType: ShopType) => {
      // 复用 shopHandlers 的逻辑
      shopHandlers.handleOpenShop(shopType);
    },
    getCurrentPlayer,
    isInteractionPending: hasPendingInteractive,
    onCommitRealmEntry: commitRealmEntry,
    onStartBattle: startBattle,
    onStartInteractive: () => {
      if (interactiveActiveRef.current || isDead) return true;
      // Keep ordinary events, shops and drops available; the first encounter is guaranteed.
      const encountered =
        interactive.encounterCursor ?? interactive.nextSeq - 1;
      if (encountered > 0 && Math.random() >= 0.35) return false;
      const started = commitInteractive({
        type: 'begin',
        id: `campus-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        seed: Math.floor(Math.random() * 0x100000000),
      });
      if (started) {
        interactiveActiveRef.current = true;
        setAutoMeditate(false);
        setAutoAdventure(false);
        setLoading(false);
        setLastBattleReplay(null);
        setCooldown(1);
      }
      // A failed critical save must not fall through and settle an ordinary event.
      return true;
    },
  });

  useEffect(() => {
    if (interactiveActive) {
      setAutoMeditate(false);
      setAutoAdventure(false);
    }
  }, [interactiveActive]);

  // 从 handlers 中提取函数
  const handleSkipBattleLogs = battleHandlers.handleSkipBattleLogs;
  const handleCloseBattleModal = battleHandlers.handleCloseBattleModal;

  // 检测"延毕"（hp <= 0，不再删档，改为降级）
  useEffect(() => {
    if (!player || isDead || interactiveActive) return;

    if (player.hp <= 0) {
      cancelGameAI();
      setLoading(false);
      // 应用降级：保留装备/宠物/学分/天赋，掉级或降学阶，绩点清零，精力回满
      const demotion = applyDemotion(player);
      const demotedPlayer = demotion.player;

      setPlayer(demotedPlayer);
      saveGame(demotedPlayer, logs);

      setIsDead(true);
      setDeathBattleData(lastBattleReplay);

      // 关闭战斗弹窗（如果打开的话）
      setIsBattleModalOpen(false);

      // 生成降级原因
      let reason = '';
      if (lastBattleReplay && !lastBattleReplay.victory) {
        reason = `在与${lastBattleReplay.enemy.title}${lastBattleReplay.enemy.name}的战斗中，你力竭倒下。${demotion.message}`;
      } else if (lastBattleReplay) {
        reason = `虽然战胜了${lastBattleReplay.enemy.title}${lastBattleReplay.enemy.name}，但你伤势过重，被送进校医院。${demotion.message}`;
      } else {
        reason = `你在期末冲刺途中过劳倒下。${demotion.message}`;
      }
      setDeathReason(reason);

      // 停止自动功能
      setAutoMeditate(false);
      setAutoAdventure(false);
    }
  }, [
    player,
    isDead,
    lastBattleReplay,
    logs,
    saveGame,
    setPlayer,
    interactiveActive,
  ]);

  // 延毕后重新出发（不清档，回到降级后的角色）
  const handleRebirth = () => {
    cancelGameAI();
    setLoading(false);
    setIsDead(false);
    setDeathBattleData(null);
    setDeathReason('');
    setLastBattleReplay(null);
    setAutoMeditate(false);
    setAutoAdventure(false);
    // 注意：不 setPlayer(null)，保留降级后的角色继续玩
  };

  const handleMeditate = () => {
    if (loading || cooldown > 0 || !player) return;
    meditationHandlers.handleMeditate();
    setCooldown(1);
  };

  const handleUseInheritance = breakthroughHandlers.handleUseInheritance;

  const handleUseItem = itemHandlers.handleUseItem;
  const handleUseItemBatch = itemHandlers.handleUseItemBatch;
  const handleUseAllConsumables = itemHandlers.handleUseAllConsumables;
  const handleDiscardItem = itemHandlers.handleDiscardItem;
  const handleBatchDiscard = (itemIds: string[]) => {
    setPlayer((prev) => {
      const newInv = prev.inventory.filter((i) => !itemIds.includes(i.id));
      addLog(`你批量丢弃了 ${itemIds.length} 件物品。`, 'normal');
      return { ...prev, inventory: newInv };
    });
  };

  const handleEquipItem = equipmentHandlers.handleEquipItem;
  const handleUnequipItem = equipmentHandlers.handleUnequipItem;
  const handleAutoEquip = equipmentHandlers.handleAutoEquip;
  const handleRefineNatalArtifact = equipmentHandlers.handleRefineNatalArtifact;
  const handleUnrefineNatalArtifact =
    equipmentHandlers.handleUnrefineNatalArtifact;

  const handleLearnArt = cultivationHandlers.handleLearnArt;
  const handleActivateArt = cultivationHandlers.handleActivateArt;
  const handleLearnAllArts = cultivationHandlers.handleLearnAllArts;

  const handleCraft = alchemyHandlers.handleCraft;

  const handleSelectTalent = characterHandlers.handleSelectTalent;
  const handleSelectTitle = characterHandlers.handleSelectTitle;
  const handleAllocateAttribute = characterHandlers.handleAllocateAttribute;
  const handleAllocateAll = characterHandlers.handleAllocateAll;

  // 提取新的模块化 handlers
  const handleBuyItem = shopHandlers.handleBuyItem;
  const handleSellItem = shopHandlers.handleSellItem;
  const handleUpdateSettings = settingsHandlers.handleUpdateSettings;
  const handleActivatePet = petHandlers.handleActivatePet;
  const handleFeedPet = petHandlers.handleFeedPet;
  const handleEvolvePet = petHandlers.handleEvolvePet;
  const handleAutoFeed = petHandlers.handleAutoFeed;
  const handleDevourPet = petHandlers.handleDevourPet;
  const handleDraw = lotteryHandlers.handleDraw;
  const handleJoinSect = sectHandlers.handleJoinSect;
  const handleLeaveSect = sectHandlers.handleLeaveSect;
  const handleSectTask = sectHandlers.handleSectTask;
  const handleSectPromote = sectHandlers.handleSectPromote;
  const handleSectBuy = sectHandlers.handleSectBuy;
  const checkAchievements = achievementHandlers.checkAchievements;

  // 解锁音频：浏览器要求首次用户手势后才允许播放
  useEffect(() => {
    const handler = () => unlockAudio();
    window.addEventListener('pointerdown', handler);
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('keydown', handler);
    };
  }, []);

  // 被动回血 + 游戏时长累加
  // 计时器随玩家有无挂载；最新数据通过 ref 读取，避免每秒重建。
  const hasPlayer = player !== null;
  const playerRef = useLatestRef(player);
  const playtimeRef = useRef(player?.playtimeSeconds || 0);

  useEffect(() => {
    if (!hasPlayer) return;

    const timer = setInterval(() => {
      // 标签页隐藏时暂停所有 tick（浏览器本来就会节流，这里显式跳过避免无谓计算）
      if (document.hidden || interactiveActiveRef.current) return;
      playtimeRef.current += 1; // 每秒累加游戏时长（纯 JS，不触发重渲染）

      setPlayer((prev) => {
        if (!prev) return prev; // 防止 prev 为 null

        const now = Date.now();
        let hpRegenMultiplier = prev.meditationHpRegenMultiplier || 1.0;
        let meditationBoostEndTime = prev.meditationBoostEndTime;

        // 检查自习加成是否过期
        if (meditationBoostEndTime && now >= meditationBoostEndTime) {
          hpRegenMultiplier = 1.0;
          meditationBoostEndTime = null;
        }

        // 只有真正需要更新（回血 or 加成过期）时才返回新对象，否则 bail out 避免重渲染
        const needHp = prev.hp < prev.maxHp;
        const needBoostReset =
          hpRegenMultiplier !== prev.meditationHpRegenMultiplier ||
          meditationBoostEndTime !== prev.meditationBoostEndTime;
        if (!needHp && !needBoostReset) {
          return prev; // React 检测到相同引用，跳过重渲染
        }

        // 计算回血量：基础回血 * 自习加成倍数
        const baseRegen = Math.max(1, Math.floor(prev.maxHp * 0.01));
        const actualRegen = Math.floor(baseRegen * hpRegenMultiplier);

        return {
          ...prev,
          hp: needHp ? Math.min(prev.maxHp, prev.hp + actualRegen) : prev.hp,
          meditationHpRegenMultiplier: hpRegenMultiplier,
          meditationBoostEndTime: meditationBoostEndTime,
        };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [hasPlayer, setPlayer]);

  // 切换玩家（新建/加载不同存档）时重置游戏时长 ref
  useEffect(() => {
    if (playerRef.current) {
      playtimeRef.current = playerRef.current.playtimeSeconds || 0;
    }
  }, [player?.name, playerRef]);

  const meditateRef = useLatestRef(meditationHandlers.handleMeditate);
  const adventureRef = useLatestRef(adventureHandlers.handleAdventure);
  const breakthroughRef = useLatestRef(breakthroughHandlers.handleBreakthrough);

  // 自动自习逻辑
  useEffect(() => {
    if (
      interactiveActive ||
      !autoMeditate ||
      !player ||
      loading ||
      cooldown > 0
    )
      return;

    const timer = setTimeout(() => {
      if (
        !interactiveActiveRef.current &&
        autoMeditate &&
        !loading &&
        cooldown === 0 &&
        player
      ) {
        if (loading || cooldown > 0 || !player) return;
        meditateRef.current();
        setCooldown(1);
      }
    }, 100); // 短暂延迟，确保状态更新完成

    return () => clearTimeout(timer);
  }, [
    autoMeditate,
    player,
    loading,
    cooldown,
    meditateRef,
    setCooldown,
    interactiveActive,
  ]);

  // 自动期末冲刺逻辑
  useEffect(() => {
    if (
      interactiveActive ||
      !autoAdventure ||
      !player ||
      loading ||
      cooldown > 0
    )
      return;
    // if (player.hp < player.maxHp * 0.2) {
    //   // 如果精力过低，停止自动冲刺
    //   setAutoAdventure(false);
    //   addLog('你精力见底，自动冲刺已停止。请先自习恢复。', 'danger');
    //   return;
    // }

    // 生死有命！富贵在天！！！
    const timer = setTimeout(() => {
      if (
        !interactiveActiveRef.current &&
        autoAdventure &&
        !loading &&
        cooldown === 0 &&
        player
      ) {
        adventureRef.current();
      }
    }, 100); // 短暂延迟，确保状态更新完成

    return () => clearTimeout(timer);
  }, [
    autoAdventure,
    player,
    loading,
    cooldown,
    adventureRef,
    interactiveActive,
  ]);

  // 从冒险 handlers 中提取函数
  const { handleAdventure, executeAdventure } = adventureHandlers;

  // 现在可以使用 executeAdventure 初始化 realmHandlers
  const realmHandlers = useRealmHandlers({
    player,
    setPlayer,
    addLog,
    setLoading,
    setCooldown,
    loading,
    cooldown,
    setIsRealmOpen,
    executeAdventure,
    getCurrentPlayer,
    isInteractionPending: hasPendingInteractive,
  });
  const handleEnterRealm = realmHandlers.handleEnterRealm;
  // 冒险行为由 useAdventureHandlers 提供的 handleAdventure 实现

  // Reactive Level Up Check
  const playerExp = player?.exp;
  const playerMaxExp = player?.maxExp;
  useEffect(() => {
    if (
      !interactiveActive &&
      playerExp !== undefined &&
      playerMaxExp !== undefined &&
      playerExp >= playerMaxExp
    ) {
      breakthroughRef.current();
    }
  }, [playerExp, playerMaxExp, breakthroughRef, interactiveActive]);

  // 保留 handleOpenUpgrade 和 handleUpgradeItem，因为它们需要状态管理
  const handleOpenUpgrade = (item: Item) => {
    setItemToUpgrade(item);
    setIsUpgradeOpen(true);
  };

  // handleUpgradeItem 不关闭弹窗，让用户可以继续强化
  const handleUpgradeItem = async (
    item: Item,
    costStones: number,
    costMats: number,
    upgradeStones: number = 0
  ): Promise<'success' | 'failure' | 'error'> => {
    return equipmentHandlers.handleUpgradeItem(
      item,
      costStones,
      costMats,
      upgradeStones
    );
    // 弹窗会自动从 player.inventory 中获取最新的物品信息
  };

  // 一键强化：连续强化直到材料不足
  const handleUpgradeItemAll = async (
    item: Item,
    costStones: number,
    costMats: number
  ): Promise<number> => {
    return equipmentHandlers.handleUpgradeItemAll(item, costStones, costMats);
  };

  // Sect handlers、Achievement、Pet、Lottery、Settings handlers 已全部移到对应模块

  // 排行榜：每 60 秒尝试提交一次（仅在 realm >= '硕士' 时）
  useEffect(() => {
    const currentPlayer = playerRef.current;
    if (
      interactiveActive ||
      !currentPlayer ||
      !isEligibleForLeaderboard(currentPlayer.realm)
    )
      return;
    const now = Date.now();
    if (now - (currentPlayer.lastLeaderboardSubmit || 0) < 60_000) return;

    const t = setTimeout(() => {
      submitScore(
        {
          name: currentPlayer.name,
          realm: currentPlayer.realm,
          realmLevel: currentPlayer.realmLevel,
          spiritStones: currentPlayer.spiritStones,
          exp: currentPlayer.exp,
        },
        playtimeRef.current // 用 ref 里的最新游戏时长
      ).then((ok) => {
        if (ok) {
          // 同步游戏时长回 player（每 60 秒一次，可接受）
          setPlayer((prev) =>
            prev && prev.name === currentPlayer.name
              ? {
                  ...prev,
                  playtimeSeconds: playtimeRef.current,
                  lastLeaderboardSubmit: Date.now(),
                }
              : prev
          );
        }
      });
    }, 0);

    return () => clearTimeout(t);
  }, [
    player?.name,
    player?.realm,
    player?.realmLevel,
    player?.spiritStones,
    player?.exp,
    player?.playtimeSeconds,
    player?.lastLeaderboardSubmit,
    playerRef,
    setPlayer,
    interactiveActive,
  ]);

  // 检查成就（学阶变化时）
  useEffect(() => {
    if (hasPlayer && !interactiveActive) {
      checkAchievements();
    }
  }, [
    hasPlayer,
    player?.realm,
    player?.realmLevel,
    checkAchievements,
    interactiveActive,
  ]);

  // ============ 路由：首页 → 创建角色 → 游戏中 ============
  // 首页（存档选择）
  if (screen === 'home') {
    return (
      <>
        {saveError && (
          <p
            role="alert"
            className="fixed top-3 left-3 right-3 z-[100] mx-auto max-w-lg border border-npu-border bg-npu-panel p-3 text-center text-sm text-npu-warn"
          >
            {saveError}
          </p>
        )}
        <HomeScreen
          hasSave={hasSave}
          onNewGame={() => setScreen('create')}
          onContinueGame={handleContinueGame}
          onDeleteSave={handleDeleteSave}
        />
      </>
    );
  }

  // 创建角色（三步骤开屏仪式）
  if (screen === 'create') {
    return (
      <>
        {saveError && (
          <p
            role="alert"
            className="fixed top-3 left-3 right-3 z-[100] mx-auto max-w-lg border border-npu-border bg-npu-panel p-3 text-center text-sm text-npu-warn"
          >
            {saveError}
          </p>
        )}
        <StartScreen onStart={handleStartGame} />
      </>
    );
  }

  // 游戏中（gameStarted === true && screen === 'playing'）
  if (!player) {
    // 异常状态：should not happen，但兜底显示首页
    return (
      <HomeScreen
        hasSave={hasSave}
        onNewGame={() => setScreen('create')}
        onContinueGame={handleContinueGame}
        onDeleteSave={handleDeleteSave}
      />
    );
  }

  return (
    <>
      <div
        inert={interactiveActive}
        aria-hidden={interactiveActive || undefined}
      >
        {saveError && !interactiveActive && (
          <p
            role="alert"
            className="fixed top-3 left-3 right-3 z-[100] mx-auto max-w-lg border border-npu-border bg-npu-panel p-3 text-center text-sm text-npu-warn"
          >
            {saveError}
          </p>
        )}
        {/* 死亡弹窗 - 无法关闭 */}
        {isDead && player && (
          <DeathModal
            player={player}
            battleData={deathBattleData}
            deathReason={deathReason}
            onRebirth={handleRebirth}
          />
        )}

        <GameView
          player={player}
          logs={logs}
          visualEffects={visualEffects}
          loading={loading}
          cooldown={cooldown}
          purchaseSuccess={purchaseSuccess}
          lotteryRewards={lotteryRewards}
          itemActionLog={itemActionLog}
          isMobileSidebarOpen={isMobileSidebarOpen}
          isMobileStatsOpen={isMobileStatsOpen}
          modals={{
            isInventoryOpen,
            isCultivationOpen,
            isCharacterOpen,
            isAchievementOpen,
            isPetOpen,
            isLotteryOpen,
            isSettingsOpen,
            isRealmOpen,
            isAlchemyOpen,
            isSectOpen,
            setIsMobileSidebarOpen,
            setIsMobileStatsOpen,
            setIsInventoryOpen,
            setIsCultivationOpen,
            setIsCharacterOpen,
            setIsAchievementOpen,
            setIsPetOpen,
            setIsLotteryOpen,
            setIsSettingsOpen,
            setIsRealmOpen,
            setIsAlchemyOpen,
            setIsSectOpen,
          }}
          handlers={{
            onMeditate: handleMeditate,
            onAdventure: handleAdventure,
            onOpenRealm: () => setIsRealmOpen(true),
            onOpenAlchemy: () => setIsAlchemyOpen(true),
            onOpenSect: () => setIsSectOpen(true),
            onOpenMenu: () => setIsMobileSidebarOpen(true),
            onOpenCultivation: () => setIsCultivationOpen(true),
            onOpenInventory: () => setIsInventoryOpen(true),
            onOpenCharacter: () => setIsCharacterOpen(true),
            onOpenAchievement: () => {
              setIsAchievementOpen(true);
              setPlayer((prev) => ({
                ...prev,
                viewedAchievements: [...prev.achievements],
              }));
            },
            onOpenPet: () => setIsPetOpen(true),
            onOpenLottery: () => setIsLotteryOpen(true),
            onOpenSettings: () => setIsSettingsOpen(true),
            onOpenLeaderboard: () => setIsLeaderboardOpen(true),
            onOpenStats: () => setIsMobileStatsOpen(true),
            onUpdateViewedAchievements: () => {
              setPlayer((prev) => ({
                ...prev,
                viewedAchievements: [...prev.achievements],
              }));
            },
            autoMeditate,
            autoAdventure,
            onToggleAutoMeditate: () => setAutoMeditate((prev) => !prev),
            onToggleAutoAdventure: () => setAutoAdventure((prev) => !prev),
          }}
        />

        <LeaderboardPanel
          isOpen={isLeaderboardOpen}
          onClose={() => setIsLeaderboardOpen(false)}
          currentPlayerName={player?.name}
        />

        <ModalsContainer
          player={player}
          onImportSave={importGameSave}
          settings={settings}
          setItemActionLog={setItemActionLog}
          modals={{
            isInventoryOpen,
            isCultivationOpen,
            isAlchemyOpen,
            isUpgradeOpen,
            isSectOpen,
            isRealmOpen,
            isCharacterOpen,
            isAchievementOpen,
            isPetOpen,
            isLotteryOpen,
            isSettingsOpen,
            isShopOpen,
            isBattleModalOpen: isBattleModalOpen && !isDead, // 死亡时不显示战斗弹窗
          }}
          modalState={{
            currentShop,
            itemToUpgrade,
            battleReplay,
            revealedBattleRounds,
          }}
          handlers={{
            setIsInventoryOpen: (open: boolean) => setIsInventoryOpen(open),
            setIsCultivationOpen: (open: boolean) => setIsCultivationOpen(open),
            setIsAlchemyOpen: (open: boolean) => setIsAlchemyOpen(open),
            setIsUpgradeOpen: (open: boolean) => {
              setIsUpgradeOpen(open);
              if (!open) setItemToUpgrade(null);
            },
            setIsSectOpen: (open: boolean) => setIsSectOpen(open),
            setIsRealmOpen: (open: boolean) => setIsRealmOpen(open),
            setIsCharacterOpen: (open: boolean) => setIsCharacterOpen(open),
            setIsAchievementOpen: (open: boolean) => setIsAchievementOpen(open),
            setIsPetOpen: (open: boolean) => setIsPetOpen(open),
            setIsLotteryOpen: (open: boolean) => setIsLotteryOpen(open),
            setIsSettingsOpen: (open: boolean) => setIsSettingsOpen(open),
            setIsShopOpen: (open: boolean) => {
              setIsShopOpen(open);
              if (!open) setCurrentShop(null);
            },
            setIsBattleModalOpen: (open: boolean) => setIsBattleModalOpen(open),
            setItemToUpgrade,
            setCurrentShop,
            setBattleReplay,
            setRevealedBattleRounds,
            handleSkipBattleLogs,
            handleCloseBattleModal,
            handleUseItem,
            handleUseItemBatch,
            handleUseAllConsumables,
            handleEquipItem,
            handleUnequipItem,
            handleAutoEquip,
            handleOpenUpgrade,
            handleDiscardItem,
            handleBatchDiscard,
            handleRefineNatalArtifact,
            handleUnrefineNatalArtifact,
            handleUpgradeItem,
            handleUpgradeItemAll,
            handleLearnArt,
            handleActivateArt,
            handleLearnAllArts,
            handleCraft,
            handleJoinSect,
            handleLeaveSect,
            handleSectTask,
            handleSectPromote,
            handleSectBuy,
            handleEnterRealm,
            handleSelectTalent,
            handleSelectTitle,
            handleAllocateAttribute,
            handleAllocateAll,
            handleUseInheritance,
            handleUpdateViewedAchievements: () => {
              setPlayer((prev) => ({
                ...prev,
                viewedAchievements: [...prev.achievements],
              }));
            },
            handleActivatePet,
            handleFeedPet,
            handleEvolvePet,
            handleAutoFeed,
            handleDevourPet,
            handleDraw,
            handleUpdateSettings,
            handleBuyItem,
            handleSellItem,
          }}
        />
      </div>
      <InteractiveEncounterModal
        pending={interactive.pending ?? null}
        player={player}
        error={saveError}
        onChoose={(id, choiceId) => {
          if (commitInteractive({ type: 'choose', id, choiceId }))
            playSound('confirm');
        }}
        onCommand={(id, seq, action) => {
          if (commitInteractive({ type: 'battle', id, seq, action }))
            playSound(action === 'retreat' ? 'confirm' : 'battle');
        }}
        onAcknowledge={(id) => {
          if (commitInteractive({ type: 'acknowledge', id })) {
            playSound('confirm');
            setCooldown(1);
          }
        }}
      />
    </>
  );
}

export default App;
