import React, { useEffect, useMemo, useRef } from 'react';
import { PlayerStats, LogEntry } from '../types';
import StatsPanel from '../components/StatsPanel';
import LogPanel from '../components/LogPanel';
import CombatVisuals from '../components/CombatVisuals';
import MobileSidebar from '../components/MobileSidebar';
import GameHeader from './GameHeader';
import ActionBar from './ActionBar';
import {
  PurchaseSuccessToast,
  LotteryRewardsToast,
  ItemActionToast,
} from './NotificationToast';

/**
 * 游戏视图组件
 * 包含游戏头部、操作按钮栏、日志面板、属性面板、移动端侧边栏
 * 游戏头部：包含游戏标题、菜单按钮、桌面按钮
 * 操作按钮栏：包含自习、期末周、考研副本、咖啡店、社团五个按钮
 * 日志面板：包含游戏日志
 * 属性面板：包含玩家属性
 * 移动端侧边栏：包含课程、储物袋、角色、成就、室友、抽奖、设置七个按钮
 * 课程按钮：打开课程面板
 * 储物袋按钮：打开储物袋面板
 * 角色按钮：打开角色面板
 * 成就按钮：打开成就面板
 * 室友按钮：打开室友面板
 * 抽奖按钮：打开抽奖面板
 * 设置按钮：打开设置面板
 */

interface GameViewProps {
  player: PlayerStats;
  logs: LogEntry[];
  visualEffects: React.ComponentProps<typeof CombatVisuals>['effects'];
  loading: boolean;
  cooldown: number;
  purchaseSuccess: { item: string; quantity: number } | null;
  lotteryRewards: Array<{ type: string; name: string; quantity?: number }>;
  itemActionLog: { text: string; type: string } | null;
  isMobileSidebarOpen: boolean;
  isMobileStatsOpen: boolean;
  modals: {
    isInventoryOpen: boolean;
    isCultivationOpen: boolean;
    isCharacterOpen: boolean;
    isAchievementOpen: boolean;
    isPetOpen: boolean;
    isLotteryOpen: boolean;
    isSettingsOpen: boolean;
    isRealmOpen: boolean;
    isAlchemyOpen: boolean;
    isSectOpen: boolean;
    setIsMobileSidebarOpen: (open: boolean) => void;
    setIsMobileStatsOpen: (open: boolean) => void;
    setIsInventoryOpen: (open: boolean) => void;
    setIsCultivationOpen: (open: boolean) => void;
    setIsCharacterOpen: (open: boolean) => void;
    setIsAchievementOpen: (open: boolean) => void;
    setIsPetOpen: (open: boolean) => void;
    setIsLotteryOpen: (open: boolean) => void;
    setIsSettingsOpen: (open: boolean) => void;
    setIsRealmOpen: (open: boolean) => void;
    setIsAlchemyOpen: (open: boolean) => void;
    setIsSectOpen: (open: boolean) => void;
  };
  handlers: {
    onMeditate: () => void;
    onAdventure: () => void;
    onOpenRealm: () => void;
    onOpenAlchemy: () => void;
    onOpenSect: () => void;
    onOpenMenu: () => void;
    onOpenCultivation: () => void;
    onOpenInventory: () => void;
    onOpenCharacter: () => void;
    onOpenAchievement: () => void;
    onOpenPet: () => void;
    onOpenLottery: () => void;
    onOpenSettings: () => void;
    onOpenLeaderboard: () => void;
    onOpenStats: () => void;
    onUpdateViewedAchievements: () => void;
    autoMeditate: boolean;
    autoAdventure: boolean;
    onToggleAutoMeditate: () => void;
    onToggleAutoAdventure: () => void;
  };
}

function GameView({
  player,
  logs,
  visualEffects,
  loading,
  cooldown,
  purchaseSuccess,
  lotteryRewards,
  itemActionLog,
  isMobileSidebarOpen,
  isMobileStatsOpen,
  modals,
  handlers,
}: GameViewProps) {
  // 缓存成就数量计算
  const achievementCount = useMemo(
    () =>
      player.achievements.filter((a) => !player.viewedAchievements.includes(a))
        .length,
    [player.achievements, player.viewedAchievements]
  );

  const petCount = useMemo(() => player.pets.length, [player.pets.length]);

  const lotteryTickets = useMemo(
    () => player.lotteryTickets,
    [player.lotteryTickets]
  );

  return (
    <div className="paper-game relative">
      {/* Visual Effects Layer */}
      <CombatVisuals effects={visualEffects} />

      <aside className="paper-game-aside" aria-label="个人成长档案">
        <StatsPanel player={player} />
      </aside>

      <main className="paper-game-main relative">
        <GameHeader
          player={player}
          onOpenMenu={handlers.onOpenMenu}
          onOpenCultivation={handlers.onOpenCultivation}
          onOpenInventory={handlers.onOpenInventory}
          onOpenCharacter={handlers.onOpenCharacter}
          onOpenAchievement={handlers.onOpenAchievement}
          onOpenPet={handlers.onOpenPet}
          onOpenLottery={handlers.onOpenLottery}
          onOpenSettings={handlers.onOpenSettings}
          onOpenLeaderboard={handlers.onOpenLeaderboard}
        />

        <LogPanel logs={logs} className="paper-game-reading" />

        <ActionBar
          loading={loading}
          cooldown={cooldown}
          onMeditate={handlers.onMeditate}
          onAdventure={handlers.onAdventure}
          onOpenRealm={handlers.onOpenRealm}
          onOpenAlchemy={handlers.onOpenAlchemy}
          onOpenSect={handlers.onOpenSect}
          autoMeditate={handlers.autoMeditate}
          autoAdventure={handlers.autoAdventure}
          onToggleAutoMeditate={handlers.onToggleAutoMeditate}
          onToggleAutoAdventure={handlers.onToggleAutoAdventure}
        />
      </main>

      {/* Notifications */}
      {purchaseSuccess && (
        <PurchaseSuccessToast
          item={purchaseSuccess.item}
          quantity={purchaseSuccess.quantity}
        />
      )}
      <LotteryRewardsToast rewards={lotteryRewards} />
      {itemActionLog && (
        <ItemActionToast
          log={{
            id: '',
            text: itemActionLog.text,
            type: itemActionLog.type as LogEntry['type'],
            timestamp: Date.now(),
          }}
        />
      )}

      {/* Mobile Sidebar */}
      <MobileSidebar
        isOpen={isMobileSidebarOpen}
        onClose={() => modals.setIsMobileSidebarOpen(false)}
        onOpenStats={handlers.onOpenStats}
        onOpenCultivation={handlers.onOpenCultivation}
        onOpenInventory={handlers.onOpenInventory}
        onOpenCharacter={handlers.onOpenCharacter}
        onOpenAchievement={handlers.onOpenAchievement}
        onOpenPet={handlers.onOpenPet}
        onOpenLottery={handlers.onOpenLottery}
        onOpenSettings={handlers.onOpenSettings}
        onOpenLeaderboard={handlers.onOpenLeaderboard}
        achievementCount={achievementCount}
        petCount={petCount}
        lotteryTickets={lotteryTickets}
      />

      {isMobileStatsOpen && (
        <MobileStatsDialog
          player={player}
          onClose={() => modals.setIsMobileStatsOpen(false)}
        />
      )}
    </div>
  );
}

function MobileStatsDialog({
  player,
  onClose,
}: {
  player: PlayerStats;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    // 目录项会随目录关闭而 inert；从目录进入时，最终回到可见的目录触发按钮。
    const returnFocus =
      previousFocus instanceof HTMLElement &&
      previousFocus !== document.body &&
      !previousFocus.closest('#paper-campus-mobile-menu, [inert]')
        ? previousFocus
        : document.querySelector<HTMLButtonElement>(
            'button[aria-controls="paper-campus-mobile-menu"]'
          );

    // 在本轮所有 effect 清理之后聚焦，避免被目录的关闭回焦覆盖。
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(focusTimer);
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>(
      'button:not([disabled])'
    );
    if (!buttons?.length) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="paper-overlay fixed inset-0 flex items-end justify-center z-[70] p-0 md:hidden touch-manipulation"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="paper-mobile-record"
        role="dialog"
        aria-modal="true"
        aria-label="个人成长档案"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <button
          ref={closeRef}
          type="button"
          className="paper-record-close"
          onClick={onClose}
        >
          关闭档案
        </button>
        <StatsPanel player={player} />
      </div>
    </div>
  );
}

export default React.memo(GameView);
