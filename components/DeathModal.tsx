import React from 'react';
import { PlayerStats } from '../types';
import { BattleReplay } from '../services/battleService';
import { Flame, Sword, Heart, Skull } from 'lucide-react';

interface DeathModalProps {
  player: PlayerStats;
  battleData: BattleReplay | null;
  deathReason: string;
  onRebirth: () => void;
}

const DeathModal: React.FC<DeathModalProps> = ({
  player,
  battleData,
  deathReason,
  onRebirth,
}) => {
  // 计算战斗统计
  const battleStats = battleData
    ? {
        totalRounds: battleData.rounds.length,
        playerDamage: battleData.rounds
          .filter((r) => r.attacker === 'player')
          .reduce((sum, r) => sum + r.damage, 0),
        enemyDamage: battleData.rounds
          .filter((r) => r.attacker === 'enemy')
          .reduce((sum, r) => sum + r.damage, 0),
        critCount: battleData.rounds.filter((r) => r.crit).length,
        maxDamage: Math.max(...battleData.rounds.map((r) => r.damage), 0),
      }
    : null;

  return (
    <div className="fixed inset-0 paper-overlay flex items-center justify-center z-[100] p-2 md:p-4 overflow-y-auto font-mono">
      <div className="bg-npu-panel border-2 border-npu-warn p-3 md:p-6 max-w-lg md:max-w-2xl w-full my-auto">
        {/* 标题 */}
        <div className="text-center mb-3 md:mb-4">
          <div className="text-[10px] md:text-xs text-npu-warn mb-2 tracking-widest">
            {'> EXIT CODE 1 · SEMESTER FAILED'}
          </div>
          <div className="flex items-center justify-center gap-2 md:gap-3 mb-2 md:mb-3">
            <Skull
              size={32}
              className="md:w-12 md:h-12 text-npu-warn animate-pulse"
            />
            <h1 className="text-2xl md:text-3xl font-bold text-npu-warn">
              延 毕
            </h1>
            <Skull
              size={32}
              className="md:w-12 md:h-12 text-npu-warn animate-pulse"
            />
          </div>
          <p className="text-npu-dim text-sm md:text-base">
            {player.name} 挂科延毕一年，收到了学院的《延毕告知书》……
          </p>
          <p className="text-npu-muted text-xs md:text-sm mt-1">
            别慌，装备/宠物/学分都保住了，重读一年再来！
          </p>
        </div>

        {/* 挂科原因 */}
        <div className="bg-npu-bg border border-npu-warn/50 p-2 md:p-3 mb-3 md:mb-4">
          <h2 className="text-base md:text-lg font-bold text-npu-warn mb-1 md:mb-2 flex items-center gap-1 md:gap-2">
            <Flame size={16} className="md:w-5 md:h-5" />
            挂科原因
          </h2>
          <p className="text-npu-text text-xs md:text-sm leading-relaxed">
            {deathReason}
          </p>
        </div>

        {/* 战斗统计 */}
        {battleStats && battleData && (
          <div className="bg-npu-bg border border-npu-warn/50 p-2 md:p-3 mb-3 md:mb-4">
            <h2 className="text-base md:text-lg font-bold text-npu-warn mb-2 md:mb-3 flex items-center gap-1 md:gap-2">
              <Sword size={16} className="md:w-5 md:h-5" />
              最后一场硬仗
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
              <div className="bg-npu-panel border border-npu-border p-2">
                <div className="text-npu-muted text-xs mb-0.5 md:mb-1">
                  {'// 对手'}
                </div>
                <div className="text-npu-text font-bold text-sm md:text-base break-words">
                  {battleData.enemy.title}
                  {battleData.enemy.name}
                </div>
              </div>
              <div className="bg-npu-panel border border-npu-border p-2">
                <div className="text-npu-muted text-xs mb-0.5 md:mb-1">
                  {'// 交锋轮次'}
                </div>
                <div className="text-npu-text font-bold text-sm md:text-base">
                  {battleStats.totalRounds} 回合
                </div>
              </div>
              <div className="bg-npu-panel border border-npu-border p-2">
                <div className="text-npu-muted text-xs mb-0.5 md:mb-1">
                  {'// 造成伤害'}
                </div>
                <div className="text-npu-code font-bold text-sm md:text-base">
                  {battleStats.playerDamage}
                </div>
              </div>
              <div className="bg-npu-panel border border-npu-border p-2">
                <div className="text-npu-muted text-xs mb-0.5 md:mb-1">
                  {'// 承受伤害'}
                </div>
                <div className="text-npu-warn font-bold text-sm md:text-base">
                  {battleStats.enemyDamage}
                </div>
              </div>
              <div className="bg-npu-panel border border-npu-border p-2">
                <div className="text-npu-muted text-xs mb-0.5 md:mb-1">
                  {'// 暴击次数'}
                </div>
                <div className="text-npu-circuit font-bold text-sm md:text-base">
                  {battleStats.critCount}
                </div>
              </div>
              <div className="bg-npu-panel border border-npu-border p-2">
                <div className="text-npu-muted text-xs mb-0.5 md:mb-1">
                  {'// 最大伤害'}
                </div>
                <div className="text-npu-iot font-bold text-sm md:text-base">
                  {battleStats.maxDamage}
                </div>
              </div>
            </div>
            <div className="mt-2 md:mt-3 pt-2 md:pt-3 border-t border-npu-border space-y-1 md:space-y-2">
              <div className="flex items-center justify-between text-npu-dim text-xs md:text-sm">
                <span>开考前精力:</span>
                <span className="font-bold">{battleData.playerHpBefore}</span>
              </div>
              <div className="flex items-center justify-between text-npu-dim text-xs md:text-sm">
                <span>交卷后精力:</span>
                <span className="font-bold text-npu-warn">
                  {battleData.playerHpAfter}
                </span>
              </div>
              <div className="flex items-center justify-between text-npu-warn text-xs md:text-sm font-bold">
                <span>精力损耗:</span>
                <span>-{battleData.hpLoss}</span>
              </div>
            </div>
          </div>
        )}

        {/* 角色信息 */}
        <div className="bg-npu-bg border border-npu-warn/50 p-2 md:p-3 mb-3 md:mb-4">
          <h2 className="text-base md:text-lg font-bold text-npu-warn mb-2 md:mb-3 flex items-center gap-1 md:gap-2">
            <Heart size={16} className="md:w-5 md:h-5" />
            最终成绩单
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="bg-npu-panel border border-npu-border p-1.5 md:p-2">
              <div className="text-npu-muted text-[10px] md:text-xs mb-0.5 md:mb-1">
                {'// 学阶'}
              </div>
              <div className="text-npu-text font-bold text-xs md:text-sm">
                {player.realm}
              </div>
            </div>
            <div className="bg-npu-panel border border-npu-border p-1.5 md:p-2">
              <div className="text-npu-muted text-[10px] md:text-xs mb-0.5 md:mb-1">
                {'// 等级'}
              </div>
              <div className="text-npu-text font-bold text-xs md:text-sm">
                Lv.{player.realmLevel}
              </div>
            </div>
            <div className="bg-npu-panel border border-npu-border p-1.5 md:p-2">
              <div className="text-npu-muted text-[10px] md:text-xs mb-0.5 md:mb-1">
                {'// 绩点'}
              </div>
              <div className="text-npu-text font-bold text-xs md:text-sm">
                {player.exp}
              </div>
            </div>
            <div className="bg-npu-panel border border-npu-border p-1.5 md:p-2">
              <div className="text-npu-muted text-[10px] md:text-xs mb-0.5 md:mb-1">
                {'// 学分'}
              </div>
              <div className="text-npu-text font-bold text-xs md:text-sm">
                {player.spiritStones}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
            <div className="bg-npu-panel border border-npu-border p-1.5 md:p-2">
              <div className="text-npu-muted text-[10px] md:text-xs mb-0.5 md:mb-1">
                {'// 攻击'}
              </div>
              <div className="text-npu-warn font-bold text-xs md:text-sm">
                {player.attack}
              </div>
            </div>
            <div className="bg-npu-panel border border-npu-border p-1.5 md:p-2">
              <div className="text-npu-muted text-[10px] md:text-xs mb-0.5 md:mb-1">
                {'// 防御'}
              </div>
              <div className="text-npu-signal font-bold text-xs md:text-sm">
                {player.defense}
              </div>
            </div>
            <div className="bg-npu-panel border border-npu-border p-1.5 md:p-2">
              <div className="text-npu-muted text-[10px] md:text-xs mb-0.5 md:mb-1">
                {'// 精力上限'}
              </div>
              <div className="text-npu-algorithm font-bold text-xs md:text-sm">
                {player.maxHp}
              </div>
            </div>
            <div className="bg-npu-panel border border-npu-border p-1.5 md:p-2">
              <div className="text-npu-muted text-[10px] md:text-xs mb-0.5 md:mb-1">
                {'// 手速'}
              </div>
              <div className="text-npu-optoelectronic font-bold text-xs md:text-sm">
                {player.speed}
              </div>
            </div>
          </div>
        </div>

        {/* 继续按钮 */}
        <div className="text-center">
          <button
            onClick={onRebirth}
            className="w-full py-2.5 md:py-3 bg-npu-warn text-npu-bg hover:opacity-80 font-bold text-base md:text-lg transition-opacity active:scale-95 flex items-center justify-center gap-2 md:gap-3 touch-manipulation"
          >
            <Flame size={18} className="md:w-6 md:h-6" />
            收拾心情 · 重新出发
          </button>
          <p className="text-npu-muted text-xs md:text-sm mt-2 md:mt-3">
            延毕不是终点。装备、宠物、学分都还在，重新出发把绩点刷回来！
          </p>
        </div>
      </div>
    </div>
  );
};

export default DeathModal;
