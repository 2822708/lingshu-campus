import React, { useMemo } from 'react';
import { Menu } from 'lucide-react';
import { PlayerStats } from '../types';
import { findLingGen, findMingGe } from '../npu-data';

interface GameHeaderProps {
  player: PlayerStats;
  onOpenMenu: () => void;
  onOpenCultivation: () => void;
  onOpenInventory: () => void;
  onOpenCharacter: () => void;
  onOpenAchievement: () => void;
  onOpenPet: () => void;
  onOpenLottery: () => void;
  onOpenSettings: () => void;
  onOpenLeaderboard: () => void;
}

function GameHeader({
  player,
  onOpenMenu,
  onOpenCultivation,
  onOpenInventory,
  onOpenCharacter,
  onOpenAchievement,
  onOpenPet,
  onOpenLottery,
  onOpenSettings,
  onOpenLeaderboard,
}: GameHeaderProps) {
  const newAchievementsCount = useMemo(
    () =>
      player.achievements.filter(
        (id) => !player.viewedAchievements.includes(id)
      ).length,
    [player.achievements, player.viewedAchievements]
  );
  const { lingGen, mingGe } = useMemo(() => {
    if (!player.talentId?.startsWith('npu:')) return {};
    const [, lingGenId, mingGeId] = player.talentId.split(':');
    return { lingGen: findLingGen(lingGenId), mingGe: findMingGe(mingGeId) };
  }, [player.talentId]);

  return (
    <header className="paper-nav-header">
      <div className="paper-nav-heading">
        <div className="paper-nav-title-group">
          <h1 className="paper-nav-brand">灵枢录·南邮修仙传</h1>
          <p className="paper-nav-profile">
            {lingGen ? (
              <>
                <span className="paper-nav-college">{lingGen.college}</span>
                <span>{lingGen.name}</span>
              </>
            ) : (
              <span>校园成长档案</span>
            )}
            {mingGe && <span>{mingGe.name}</span>}
          </p>
        </div>
        <p className="paper-nav-stage">
          {player.realm}
          <span>{player.realmLevel} 级</span>
        </p>
        <button
          type="button"
          onClick={onOpenMenu}
          className="paper-nav-menu-button"
          aria-label="打开功能目录"
          aria-controls="paper-campus-mobile-menu"
        >
          <Menu size={21} aria-hidden="true" />
        </button>
      </div>
      <nav className="paper-nav-desktop" aria-label="校园功能">
        <HeaderButton label="课程" onClick={onOpenCultivation} />
        <HeaderButton label="背包" onClick={onOpenInventory} />
        <HeaderButton label="角色" onClick={onOpenCharacter} />
        <HeaderButton
          label="成就"
          onClick={onOpenAchievement}
          badge={newAchievementsCount || undefined}
        />
        <HeaderButton
          label="室友"
          onClick={onOpenPet}
          badge={player.pets.length || undefined}
        />
        <HeaderButton
          label="抽奖"
          onClick={onOpenLottery}
          badge={player.lotteryTickets > 0 ? player.lotteryTickets : undefined}
        />
        <HeaderButton label="榜单" onClick={onOpenLeaderboard} />
        <HeaderButton label="设置" onClick={onOpenSettings} />
      </nav>
    </header>
  );
}

function HeaderButton({
  label,
  onClick,
  badge,
}: {
  label: string;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button type="button" onClick={onClick} className="paper-nav-link">
      <span>{label}</span>
      {badge !== undefined && <span className="paper-nav-count">{badge}</span>}
    </button>
  );
}

export default React.memo(GameHeader);
