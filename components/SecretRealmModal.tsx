import React, { useState, useMemo } from 'react';
import { PlayerStats, RealmType, SecretRealm } from '../types';
import { REALM_ORDER } from '../constants';
import { generateRandomRealms } from '../services/randomService';
import { X, Mountain, Gem, Ticket, RefreshCw } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  player: PlayerStats;
  onEnter: (realm: SecretRealm) => void;
}

const SecretRealmModal: React.FC<Props> = ({
  isOpen,
  onClose,
  player,
  onEnter,
}) => {
  const [refreshKey, setRefreshKey] = useState(0);

  // 将手动刷新批次与随机结果一同缓存，普通重渲染不会重新抽取。
  const { realms: availableRealms } = useMemo(() => {
    return { refreshKey, realms: generateRandomRealms(player.realm, 6) };
  }, [player.realm, refreshKey]);

  if (!isOpen) return null;

  const getRealmIndex = (r: RealmType) => REALM_ORDER.indexOf(r);

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div
      className="fixed inset-0 paper-overlay flex items-end md:items-center justify-center z-50 p-0 md:p-4 touch-manipulation font-mono"
      onClick={onClose}
    >
      <div
        className="bg-npu-panel w-full h-[80vh] md:h-auto md:max-w-4xl border-0 md:border border-npu-border flex flex-col md:max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 md:p-4 border-b border-npu-border flex justify-between items-center bg-npu-bg">
          <h3 className="text-lg md:text-xl text-npu-code flex items-center gap-2">
            <Mountain size={18} className="md:w-5 md:h-5" /> 副本列表
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="px-3 py-1.5 bg-npu-panel hover:bg-npu-code hover:text-npu-bg text-npu-code border border-npu-code text-sm flex items-center gap-1.5 transition-colors min-h-[44px] md:min-h-0 touch-manipulation"
              title="刷新副本列表"
            >
              <RefreshCw size={16} />
              <span className="hidden md:inline">刷新</span>
            </button>
            <button
              onClick={onClose}
              aria-label="关闭"
              className="text-npu-dim active:text-npu-text min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="p-3 md:p-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
          {availableRealms.map((realm) => {
            const playerRealmIndex = getRealmIndex(player.realm);
            const reqRealmIndex = getRealmIndex(realm.minRealm);
            const isRealmEnough = playerRealmIndex >= reqRealmIndex;
            const canAfford = player.spiritStones >= realm.cost;
            const locked = !isRealmEnough;

            return (
              <div
                key={realm.id}
                className={`
                  relative border flex flex-col p-5 transition-colors duration-200 group
                  ${
                    locked
                      ? 'bg-npu-bg border-npu-border opacity-60'
                      : 'bg-npu-bg border-npu-border hover:border-npu-code'
                  }
                `}
              >
                <div className="flex justify-between items-start mb-2">
                  <h4
                    className={`text-xl font-bold ${locked ? 'text-npu-muted' : 'text-npu-text group-hover:text-npu-code'}`}
                  >
                    {realm.name}
                  </h4>
                  <span
                    className={`
                    text-xs px-2 py-0.5 border
                    ${
                      realm.riskLevel === '极度危险'
                        ? 'text-npu-warn border-npu-warn/60 bg-npu-warn/10'
                        : realm.riskLevel === '高'
                          ? 'text-npu-iot border-npu-iot/60 bg-npu-iot/10'
                          : 'text-npu-circuit border-npu-circuit/60 bg-npu-circuit/10'
                    }
                  `}
                  >
                    {realm.riskLevel}风险
                  </span>
                </div>

                <p className="text-sm text-npu-muted mb-4 h-12">
                  {realm.description}
                </p>

                <div className="bg-npu-panel p-3 border border-npu-border mb-4 flex-1">
                  <div className="text-xs text-npu-muted mb-2 font-bold uppercase tracking-wider flex items-center gap-1">
                    <Gem size={12} /> {'// 可能掉落'}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {realm.drops.map((drop, i) => (
                      <span
                        key={i}
                        className="text-xs text-npu-code/80 bg-npu-code/10 border border-npu-code/20 px-1.5 py-0.5"
                      >
                        {drop}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-auto space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-npu-muted">学阶要求</span>
                    <span
                      className={
                        isRealmEnough ? 'text-npu-text' : 'text-npu-warn'
                      }
                    >
                      {realm.minRealm}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-npu-muted">报名消耗</span>
                    <span
                      className={canAfford ? 'text-npu-code' : 'text-npu-warn'}
                    >
                      {realm.cost} 学分
                    </span>
                  </div>

                  <button
                    onClick={() => onEnter(realm)}
                    disabled={locked || !canAfford}
                    className={`
                       w-full py-2.5 font-bold text-sm flex items-center justify-center gap-2 mt-4 transition-colors
                       ${
                         locked || !canAfford
                           ? 'bg-npu-panel text-npu-muted cursor-not-allowed border border-npu-border'
                           : 'bg-npu-code/10 text-npu-code border border-npu-code hover:bg-npu-code hover:text-npu-bg'
                       }
                     `}
                  >
                    {locked ? '学阶不足' : !canAfford ? '学分不足' : '进入副本'}
                    {!locked && canAfford && <Ticket size={16} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SecretRealmModal;
