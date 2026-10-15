import React, { useEffect, useRef } from 'react';
import {
  X,
  BookOpen,
  Backpack,
  Star,
  Trophy,
  Users,
  Gift,
  Settings,
  BarChart3,
  FileText,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onOpenStats: () => void;
  onOpenCultivation: () => void;
  onOpenInventory: () => void;
  onOpenCharacter: () => void;
  onOpenAchievement: () => void;
  onOpenPet: () => void;
  onOpenLottery: () => void;
  onOpenSettings: () => void;
  onOpenLeaderboard?: () => void;
  achievementCount?: number;
  petCount?: number;
  lotteryTickets?: number;
}

const MobileSidebar: React.FC<Props> = ({
  isOpen,
  onClose,
  onOpenStats,
  onOpenCultivation,
  onOpenInventory,
  onOpenCharacter,
  onOpenAchievement,
  onOpenPet,
  onOpenLottery,
  onOpenSettings,
  onOpenLeaderboard,
  achievementCount = 0,
  petCount = 0,
  lotteryTickets = 0,
}) => {
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement;
    // 等目录展开后再聚焦，避免隐藏状态和入场动画使首次聚焦被忽略。
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 200);
    return () => {
      window.clearTimeout(focusTimer);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [isOpen]);

  const menuItems = [
    { icon: FileText, label: '成长档案', onClick: onOpenStats },
    { icon: BookOpen, label: '课程', onClick: onOpenCultivation },
    { icon: Backpack, label: '背包', onClick: onOpenInventory },
    { icon: Star, label: '角色', onClick: onOpenCharacter },
    {
      icon: Trophy,
      label: '成就',
      onClick: onOpenAchievement,
      badge: achievementCount || undefined,
    },
    {
      icon: Users,
      label: '室友',
      onClick: onOpenPet,
      badge: petCount || undefined,
    },
    {
      icon: Gift,
      label: '抽奖',
      onClick: onOpenLottery,
      badge: lotteryTickets > 0 ? lotteryTickets : undefined,
    },
    ...(onOpenLeaderboard
      ? [{ icon: BarChart3, label: '榜单', onClick: onOpenLeaderboard }]
      : []),
    { icon: Settings, label: '设置', onClick: onOpenSettings },
  ];

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const buttons =
      drawerRef.current?.querySelectorAll<HTMLButtonElement>('button');
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
    <>
      {isOpen && (
        <div
          className="paper-nav-drawer-backdrop"
          aria-hidden="true"
          onClick={onClose}
        />
      )}
      <div
        id="paper-campus-mobile-menu"
        ref={drawerRef}
        className="paper-nav-drawer"
        role="dialog"
        aria-modal={isOpen ? true : undefined}
        aria-labelledby="paper-campus-mobile-menu-title"
        aria-hidden={!isOpen}
        inert={!isOpen}
        data-open={isOpen}
        onKeyDown={handleKeyDown}
      >
        <div className="paper-nav-drawer-heading">
          <div>
            <p>校园手册</p>
            <h2 id="paper-campus-mobile-menu-title">功能目录</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="paper-nav-close-button"
            onClick={onClose}
            aria-label="关闭功能目录"
          >
            <X size={21} aria-hidden="true" />
          </button>
        </div>
        <nav className="paper-nav-drawer-links" aria-label="校园功能">
          {menuItems.map(({ icon: Icon, label, onClick, badge }) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                onClick();
                onClose();
              }}
            >
              <Icon size={19} aria-hidden="true" />
              <span>{label}</span>
              {badge !== undefined && (
                <span className="paper-nav-count">{badge}</span>
              )}
            </button>
          ))}
        </nav>
        <p className="paper-nav-drawer-note">把每一天，写进成长档案。</p>
      </div>
    </>
  );
};

export default React.memo(MobileSidebar);
