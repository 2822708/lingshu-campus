import React from 'react';
import { CultivationArt, RealmType, PlayerStats } from '../types';
import { CULTIVATION_ARTS, REALM_ORDER } from '../constants';
import { X, BookOpen, Check, Lock, Zap } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  player: PlayerStats;
  onLearnArt: (art: CultivationArt) => void;
  onActivateArt: (art: CultivationArt) => void;
  onLearnAllArts?: () => void;
}

const CultivationModal: React.FC<Props> = ({
  isOpen,
  onClose,
  player,
  onLearnArt,
  onActivateArt,
  onLearnAllArts,
}) => {
  if (!isOpen) return null;

  const getRealmIndex = (r: RealmType) => REALM_ORDER.indexOf(r);

  return (
    <div
      className="fixed inset-0 paper-overlay flex items-end md:items-center justify-center z-50 p-0 md:p-4 touch-manipulation font-mono"
      onClick={onClose}
    >
      <div
        className="bg-npu-panel w-full h-[80vh] md:h-auto md:max-w-3xl border-0 md:border border-npu-border flex flex-col md:max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 md:p-4 border-b border-npu-border flex justify-between items-center bg-npu-bg">
          <h3 className="text-lg md:text-xl text-npu-code flex items-center gap-2">
            <BookOpen size={18} className="md:w-5 md:h-5" /> 选课中心
          </h3>
          <div className="flex items-center gap-2">
            {onLearnAllArts && (
              <button
                onClick={onLearnAllArts}
                className="px-3 py-1.5 rounded text-xs md:text-sm border transition-colors bg-npu-network/10 border-purple-500 text-purple-300 hover:bg-npu-network/15"
                title="一键学完所有可学课程"
              >
                <Zap size={14} className="inline mr-1" />
                一键选课
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="关闭"
              className="text-npu-dim active:text-npu-text min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="p-3 md:p-4 bg-npu-panel overflow-y-auto flex-1">
          <div className="mb-3 md:mb-4 text-xs md:text-sm text-npu-dim bg-npu-bg p-2 md:p-3 border border-npu-border">
            <p>{'// 理论课：主修课程，选定后提升学习效率。'}</p>
            <p>{'// 实操课：辅修课程，修完后永久提升属性。'}</p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:gap-4">
            {CULTIVATION_ARTS.map((art) => {
              const isLearned = player.cultivationArts.includes(art.id);
              const isActive = player.activeArtId === art.id;
              const canLearn =
                !isLearned &&
                player.spiritStones >= art.cost &&
                getRealmIndex(player.realm) >=
                  getRealmIndex(art.realmRequirement);
              const locked = !isLearned && !canLearn;

              return (
                <div
                  key={art.id}
                  className={`
                    relative p-4 border transition-colors flex flex-col sm:flex-row justify-between gap-4
                    ${isActive ? 'bg-npu-bg border-npu-code' : 'bg-npu-bg border-npu-border'}
                    ${locked ? 'opacity-60 grayscale' : ''}
                  `}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h4
                        className={`text-base md:text-lg font-bold ${isActive ? 'text-npu-code' : 'text-npu-text'}`}
                      >
                        {art.name}
                      </h4>
                      <span
                        className={`text-[10px] md:text-xs px-1.5 py-0.5 border ${art.type === 'mental' ? 'border-npu-signal/60 text-npu-signal bg-npu-signal/10' : 'border-npu-iot/60 text-npu-iot bg-npu-iot/10'}`}
                      >
                        {art.type === 'mental' ? '理论课' : '实操课'}
                      </span>
                      {isActive && (
                        <span className="text-[10px] md:text-xs text-npu-code flex items-center">
                          <Check size={10} className="md:w-3 md:h-3 mr-1" />{' '}
                          主修中
                        </span>
                      )}
                    </div>
                    <p className="text-xs md:text-sm text-npu-dim mb-2">
                      {art.description}
                    </p>
                    <div className="flex flex-wrap gap-x-3 md:gap-x-4 gap-y-1 text-[10px] md:text-xs text-npu-muted">
                      <span>
                        学阶要求:{' '}
                        <span
                          className={
                            getRealmIndex(player.realm) >=
                            getRealmIndex(art.realmRequirement)
                              ? 'text-npu-text'
                              : 'text-npu-warn'
                          }
                        >
                          {art.realmRequirement}
                        </span>
                      </span>
                      {!isLearned && (
                        <span>
                          消耗学分:{' '}
                          <span
                            className={
                              player.spiritStones >= art.cost
                                ? 'text-npu-text'
                                : 'text-npu-warn'
                            }
                          >
                            {art.cost}
                          </span>
                        </span>
                      )}
                    </div>

                    <div className="mt-2 text-[10px] md:text-xs grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {art.effects.expRate && (
                        <span className="text-npu-code">
                          +{(art.effects.expRate * 100).toFixed(0)}% 学习速度
                        </span>
                      )}
                      {art.effects.attack && (
                        <span className="text-npu-dim">
                          +{art.effects.attack} 攻击
                        </span>
                      )}
                      {art.effects.defense && (
                        <span className="text-npu-dim">
                          +{art.effects.defense} 防御
                        </span>
                      )}
                      {art.effects.hp && (
                        <span className="text-npu-dim">
                          +{art.effects.hp} 精力
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-end sm:w-32 shrink-0 mt-2 sm:mt-0">
                    {isLearned ? (
                      art.type === 'mental' ? (
                        isActive ? (
                          <button
                            disabled
                            className="px-3 py-2 md:py-1.5 bg-npu-code/10 border border-npu-code text-npu-code text-xs md:text-sm cursor-default min-h-[44px] md:min-h-0"
                          >
                            已选为主修
                          </button>
                        ) : (
                          <button
                            onClick={() => onActivateArt(art)}
                            className="px-3 py-2 md:py-1.5 bg-npu-panel active:bg-npu-border text-npu-text text-xs md:text-sm transition-colors border border-npu-border hover:border-npu-code min-h-[44px] md:min-h-0 touch-manipulation"
                          >
                            设为主修
                          </button>
                        )
                      ) : (
                        <span className="text-npu-muted text-xs md:text-sm">
                          已修完
                        </span>
                      )
                    ) : (
                      <button
                        onClick={() => onLearnArt(art)}
                        disabled={locked}
                        className={`
                          px-4 py-2 text-xs md:text-sm transition-colors flex items-center gap-1 min-h-[44px] md:min-h-0 touch-manipulation
                          ${
                            locked
                              ? 'bg-npu-panel text-npu-muted cursor-not-allowed border border-npu-border'
                              : 'bg-npu-code/10 text-npu-code border border-npu-code active:bg-npu-code active:text-npu-bg'
                          }
                        `}
                      >
                        {locked ? <Lock size={14} /> : <BookOpen size={14} />}
                        {art.cost === 0 ? '免费旁听' : '选课'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CultivationModal;
