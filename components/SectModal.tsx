import React, { useState, useMemo } from 'react';
import { PlayerStats, SectRank, RealmType, Item } from '../types';
import { SECTS, SECT_RANK_REQUIREMENTS, REALM_ORDER } from '../constants';
import {
  generateRandomSects,
  generateRandomSectTasks,
  generateSectShopItems,
  RandomSectTask,
} from '../services/randomService';
import {
  X,
  Users,
  ShoppingBag,
  Shield,
  Scroll,
  ArrowUp,
  RefreshCw,
  Zap,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  player: PlayerStats;
  onJoinSect: (sectId: string, sectName?: string) => void;
  onLeaveSect: () => void;
  onTask: (task: RandomSectTask) => void;
  onPromote: () => void;
  onBuy: (item: Partial<Item>, cost: number, quantity?: number) => void;
}

const SectModal: React.FC<Props> = ({
  isOpen,
  onClose,
  player,
  onJoinSect,
  onLeaveSect,
  onTask,
  onPromote,
  onBuy,
}) => {
  const [activeTab, setActiveTab] = useState<'hall' | 'mission' | 'shop'>(
    'hall'
  );
  const [buyQuantities, setBuyQuantities] = useState<Record<number, number>>(
    {}
  );
  const [refreshKey, setRefreshKey] = useState(0);

  // 兑换中心刷新相关状态
  const [sectShopItems, setSectShopItems] = useState<
    Array<{ name: string; cost: number; item: Omit<Item, 'id'> }>
  >(() => generateSectShopItems());
  const [shopRefreshTime, setShopRefreshTime] = useState<number>(
    () => Date.now() + 5 * 60 * 1000
  ); // 5分钟后可刷新
  const [shopRefreshCooldown, setShopRefreshCooldown] = useState<number>(() => {
    // 初始化时计算剩余倒计时
    const now = Date.now();
    const refreshTime = Date.now() + 5 * 60 * 1000;
    return Math.max(0, Math.floor((refreshTime - now) / 1000));
  }); // 倒计时（秒）

  // 刷新批次与结果一同缓存，保持手动刷新及学阶变化时重新抽取。
  const { sects: availableSects } = useMemo(() => {
    return {
      refreshKey,
      sects: player.sectId ? SECTS : generateRandomSects(player.realm, 6),
    };
  }, [player.realm, player.sectId, refreshKey]);

  // 生成随机任务列表（已加入社团时）
  const { tasks: randomTasks } = useMemo(() => {
    return {
      refreshKey,
      tasks: player.sectId ? generateRandomSectTasks(player.sectRank, 3) : [],
    };
  }, [player.sectId, player.sectRank, refreshKey]);

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  // 兑换中心刷新处理
  const handleShopRefresh = React.useCallback(() => {
    const now = Date.now();
    if (now >= shopRefreshTime) {
      setSectShopItems(generateSectShopItems());
      const newRefreshTime = now + 5 * 60 * 1000; // 设置下次刷新时间
      setShopRefreshTime(newRefreshTime);
      setShopRefreshCooldown(5 * 60); // 重置倒计时
      setBuyQuantities({}); // 清空购买数量
    }
  }, [shopRefreshTime]);

  // 兑换中心倒计时更新
  React.useEffect(() => {
    if (activeTab !== 'shop' || !isOpen) return;

    const updateCooldown = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((shopRefreshTime - now) / 1000));
      setShopRefreshCooldown(remaining);

      // 如果倒计时结束，自动刷新
      if (remaining === 0 && now >= shopRefreshTime) {
        const newItems = generateSectShopItems();
        setSectShopItems(newItems);
        const newRefreshTime = now + 5 * 60 * 1000;
        setShopRefreshTime(newRefreshTime);
        setShopRefreshCooldown(5 * 60);
        setBuyQuantities({});
      }
    };

    // 立即更新一次
    updateCooldown();

    const interval = setInterval(updateCooldown, 1000);
    return () => clearInterval(interval);
  }, [activeTab, isOpen, shopRefreshTime]);

  if (!isOpen) return null;

  const currentSect =
    availableSects.find((s) => s.id === player.sectId) ||
    SECTS.find((s) => s.id === player.sectId);
  const getRealmIndex = (r: RealmType) => REALM_ORDER.indexOf(r);

  // -- Selection View (Not in a sect) --
  if (!player.sectId) {
    return (
      <div className="fixed inset-0 font-mono text-npu-text paper-overlay flex items-center justify-center z-50 p-4">
        <div className="bg-npu-panel w-full max-w-4xl rounded border border-npu-border shadow-2xl flex flex-col max-h-[85vh]">
          <div className="p-4 border-b border-npu-border flex justify-between items-center bg-npu-panel ">
            <h3 className="text-xl font-mono text-npu-code flex items-center gap-2">
              <Users size={20} /> 加入社团
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                className="px-3 py-1.5 bg-npu-border hover:bg-npu-muted text-npu-text border border-npu-border rounded text-sm flex items-center gap-1.5 transition-colors"
                title="刷新社团列表"
              >
                <RefreshCw size={16} />
                <span className="hidden md:inline">刷新</span>
              </button>
              <button
                onClick={onClose}
                aria-label="关闭"
                className="text-npu-dim hover:text-npu-text"
              >
                <X size={24} />
              </button>
            </div>
          </div>

          <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-3 gap-4">
            {availableSects.map((sect) => {
              const canJoin =
                getRealmIndex(player.realm) >= getRealmIndex(sect.reqRealm);
              return (
                <div
                  key={sect.id}
                  className="bg-npu-panel border border-npu-border p-4 rounded flex flex-col"
                >
                  <h4 className="text-xl font-mono font-bold text-npu-text mb-2">
                    {sect.name}
                  </h4>
                  <p className="text-npu-dim text-sm mb-4 flex-1">
                    {sect.description}
                  </p>

                  <div className="text-xs text-npu-muted mb-4">
                    加入要求:{' '}
                    <span
                      className={canJoin ? 'text-npu-text' : 'text-npu-warn'}
                    >
                      {sect.reqRealm}
                    </span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (canJoin) {
                        onJoinSect(sect.id, sect.name);
                      }
                    }}
                    disabled={!canJoin}
                    className={`
                      w-full py-2 rounded font-mono text-sm transition-colors border touch-manipulation
                      ${
                        canJoin
                          ? 'bg-npu-code/20 text-npu-code border-npu-code hover:bg-npu-code/30 active:bg-npu-code/40'
                          : 'bg-npu-panel text-npu-muted border-npu-border cursor-not-allowed'
                      }
                    `}
                  >
                    {canJoin ? '申请加入' : '学阶不足'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // -- Dashboard View (In a sect) --

  // Promotion Logic
  const ranks = Object.values(SectRank);
  const currentRankIdx = ranks.indexOf(player.sectRank);
  const nextRank =
    currentRankIdx < ranks.length - 1 ? ranks[currentRankIdx + 1] : null;
  const nextReq = nextRank ? SECT_RANK_REQUIREMENTS[nextRank] : null;

  const canPromote =
    nextRank &&
    nextReq &&
    player.sectContribution >= nextReq.contribution &&
    getRealmIndex(player.realm) >= nextReq.realmIndex;

  return (
    <div
      className="fixed inset-0 paper-overlay flex items-end md:items-center justify-center z-50 p-0 md:p-4 touch-manipulation"
      onClick={onClose}
    >
      <div
        className="bg-npu-panel w-full h-[80vh] md:h-auto md:max-w-4xl md: md: border-0 md:border border-npu-border shadow-2xl flex flex-col md:h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-3 md:p-4 border-b border-npu-border bg-npu-panel md: flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="text-xl md:text-2xl font-mono text-npu-code">
                {currentSect?.name}
              </h3>
              <span className="text-[10px] md:text-xs px-2 py-0.5 rounded bg-npu-border text-npu-text border border-npu-border">
                {player.sectRank}
              </span>
            </div>
            <div className="text-xs md:text-sm text-npu-dim flex gap-4">
              <span>
                社团贡献:{' '}
                <span className="text-npu-text font-bold">
                  {player.sectContribution}
                </span>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'mission' && (
              <button
                onClick={handleRefresh}
                className="px-3 py-1.5 bg-npu-border hover:bg-npu-muted text-npu-text border border-npu-border rounded text-sm flex items-center gap-1.5 transition-colors min-h-[44px] md:min-h-0 touch-manipulation"
                title="刷新任务列表"
              >
                <RefreshCw size={16} />
                <span className="hidden md:inline">刷新</span>
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

        {/* Navigation */}
        <div className="flex border-b border-npu-border bg-npu-bg">
          <button
            onClick={() => setActiveTab('hall')}
            className={`flex-1 py-3 text-sm font-mono transition-colors flex items-center justify-center gap-2 ${activeTab === 'hall' ? 'text-npu-code bg-npu-panel border-t-2 border-npu-code' : 'text-npu-muted hover:text-npu-text'}`}
          >
            <Shield size={16} /> 社团大殿
          </button>
          <button
            onClick={() => setActiveTab('mission')}
            className={`flex-1 py-3 text-sm font-mono transition-colors flex items-center justify-center gap-2 ${activeTab === 'mission' ? 'text-npu-code bg-npu-panel border-t-2 border-npu-code' : 'text-npu-muted hover:text-npu-text'}`}
          >
            <Scroll size={16} /> 任务中心
          </button>
          <button
            onClick={() => setActiveTab('shop')}
            className={`flex-1 py-3 text-sm font-mono transition-colors flex items-center justify-center gap-2 ${activeTab === 'shop' ? 'text-npu-code bg-npu-panel border-t-2 border-npu-code' : 'text-npu-muted hover:text-npu-text'}`}
          >
            <ShoppingBag size={16} /> 兑换中心
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto bg-npu-panel">
          {/* Main Hall */}
          {activeTab === 'hall' && (
            <div className="space-y-6">
              <div className="bg-npu-panel p-4 rounded border border-npu-border">
                <h4 className="font-mono text-lg text-npu-text mb-2 border-b border-npu-border pb-2">
                  身份晋升
                </h4>
                {nextRank ? (
                  <div>
                    <p className="text-sm text-npu-dim mb-4">
                      下级职衔：
                      <span className="text-npu-text font-bold">
                        {nextRank}
                      </span>
                    </p>
                    <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                      <div className="bg-npu-bg p-2 rounded">
                        <span className="text-npu-muted block">所需贡献</span>
                        <span
                          className={
                            player.sectContribution >=
                            (nextReq?.contribution || 0)
                              ? 'text-npu-code'
                              : 'text-npu-warn'
                          }
                        >
                          {player.sectContribution} / {nextReq?.contribution}
                        </span>
                      </div>
                      <div className="bg-npu-bg p-2 rounded">
                        <span className="text-npu-muted block">所需学阶</span>
                        <span
                          className={
                            getRealmIndex(player.realm) >=
                            (nextReq?.realmIndex || 0)
                              ? 'text-npu-code'
                              : 'text-npu-warn'
                          }
                        >
                          {Object.values(RealmType)[nextReq?.realmIndex || 0]}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={onPromote}
                      disabled={!canPromote}
                      className={`
                         w-full py-2 rounded font-mono text-sm transition-colors flex items-center justify-center gap-2
                         ${
                           canPromote
                             ? 'bg-npu-code/20 text-npu-code border border-npu-code hover:bg-npu-code/30'
                             : 'bg-npu-panel text-npu-muted border border-npu-border cursor-not-allowed'
                         }
                       `}
                    >
                      <ArrowUp size={16} /> 申请晋升
                    </button>
                  </div>
                ) : (
                  <p className="text-npu-code text-center py-4">
                    你已位极人臣，乃社团之中流砥柱。
                  </p>
                )}
              </div>

              <div className="bg-npu-panel p-4 rounded border border-npu-border">
                <h4 className="font-mono text-lg text-npu-text mb-2 border-b border-npu-border pb-2">
                  退出社团
                </h4>
                <p className="text-sm text-npu-muted mb-4">
                  退出社团将清空所有贡献值，且短期内不可再次加入。
                </p>
                <button
                  onClick={onLeaveSect}
                  className="px-4 py-2 border border-npu-warn text-npu-warn hover:bg-npu-warn/10 rounded text-sm transition-colors"
                >
                  叛出社团
                </button>
              </div>
            </div>
          )}

          {/* Mission Hall */}
          {activeTab === 'mission' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-mono text-lg text-npu-text">任务列表</h4>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      // 一键完成全部：循环每个任务直到每日上限/材料不足
                      randomTasks.forEach((task) => {
                        onTask(task);
                      });
                    }}
                    className="px-3 py-1.5 bg-npu-network/10 border-purple-500 text-purple-300 hover:bg-npu-network/15 border rounded text-sm flex items-center gap-1.5 transition-colors"
                    title="一键完成当前所有任务"
                  >
                    <Zap size={16} />
                    <span>一键完成</span>
                  </button>
                  <button
                    onClick={handleRefresh}
                    className="px-3 py-1.5 bg-npu-border hover:bg-npu-muted text-npu-text border border-npu-border rounded text-sm flex items-center gap-1.5 transition-colors"
                    title="刷新任务列表"
                  >
                    <RefreshCw size={16} />
                    <span>刷新</span>
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {randomTasks.map((task) => {
                  const canComplete = (() => {
                    if (
                      task.cost?.spiritStones &&
                      player.spiritStones < task.cost.spiritStones
                    )
                      return false;
                    if (task.cost?.items) {
                      for (const itemReq of task.cost.items) {
                        const item = player.inventory.find(
                          (i) => i.name === itemReq.name
                        );
                        if (!item || item.quantity < itemReq.quantity)
                          return false;
                      }
                    }
                    // 检查每日任务限制
                    const today = new Date().toISOString().split('T')[0];
                    const lastReset = player.lastTaskResetDate || today;
                    const taskLimits: Record<string, number> = {
                      instant: 10,
                      short: 5,
                      medium: 3,
                      long: 2,
                    };
                    const limit = taskLimits[task.timeCost];
                    if (limit) {
                      const dailyTaskCount =
                        lastReset === today
                          ? player.dailyTaskCount &&
                            typeof player.dailyTaskCount === 'object'
                            ? player.dailyTaskCount
                            : typeof player.dailyTaskCount === 'number'
                              ? {
                                  instant: player.dailyTaskCount,
                                  short: 0,
                                  medium: 0,
                                  long: 0,
                                }
                              : { instant: 0, short: 0, medium: 0, long: 0 }
                          : { instant: 0, short: 0, medium: 0, long: 0 };
                      const currentCount =
                        dailyTaskCount[
                          task.timeCost as keyof typeof dailyTaskCount
                        ] || 0;
                      if (currentCount >= limit) return false;
                    }
                    return true;
                  })();

                  const timeCostText = {
                    instant: '瞬时',
                    short: '短暂',
                    medium: '中等',
                    long: '较长',
                  }[task.timeCost];

                  return (
                    <div
                      key={task.id}
                      className="bg-npu-panel p-4 rounded border border-npu-border flex flex-col"
                    >
                      <h4 className="font-mono font-bold text-npu-text mb-1">
                        {task.name}
                      </h4>
                      <p className="text-xs text-npu-muted mb-4 flex-1">
                        {task.description}
                      </p>

                      <div className="space-y-2 mb-4">
                        {task.cost && (
                          <div className="text-xs text-npu-warn">
                            消耗:{' '}
                            {task.cost.spiritStones && (
                              <span>{task.cost.spiritStones} 学分</span>
                            )}
                            {task.cost.items &&
                              task.cost.items.map((item, idx) => (
                                <span key={idx}>
                                  {idx > 0 && '、'}
                                  {item.quantity} {item.name}
                                </span>
                              ))}
                          </div>
                        )}
                        <div className="text-xs text-npu-dim">
                          奖励:{' '}
                          <span className="text-npu-code">
                            {task.reward.contribution} 贡献
                          </span>
                          {task.reward.exp && (
                            <span>、{task.reward.exp} 绩点</span>
                          )}
                          {task.reward.spiritStones && (
                            <span>、{task.reward.spiritStones} 学分</span>
                          )}
                          {task.reward.items &&
                            task.reward.items.map((item, idx) => (
                              <span key={idx}>
                                {idx === 0 && '、'}
                                {item.quantity} {item.name}
                              </span>
                            ))}
                        </div>
                        <div className="text-xs text-npu-muted">
                          耗时: {timeCostText}
                        </div>
                        {(() => {
                          const today = new Date().toISOString().split('T')[0];
                          const lastReset = player.lastTaskResetDate || today;
                          const taskLimits: Record<string, number> = {
                            instant: 10,
                            short: 5,
                            medium: 3,
                            long: 2,
                          };
                          const limit = taskLimits[task.timeCost];
                          if (limit) {
                            const dailyTaskCount =
                              lastReset === today
                                ? player.dailyTaskCount &&
                                  typeof player.dailyTaskCount === 'object'
                                  ? player.dailyTaskCount
                                  : typeof player.dailyTaskCount === 'number'
                                    ? {
                                        instant: player.dailyTaskCount,
                                        short: 0,
                                        medium: 0,
                                        long: 0,
                                      }
                                    : {
                                        instant: 0,
                                        short: 0,
                                        medium: 0,
                                        long: 0,
                                      }
                                : { instant: 0, short: 0, medium: 0, long: 0 };
                            const currentCount =
                              dailyTaskCount[
                                task.timeCost as keyof typeof dailyTaskCount
                              ] || 0;
                            return (
                              <div className="text-xs text-npu-muted">
                                今日已完成: {currentCount} / {limit} 次
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>

                      <button
                        onClick={() => onTask(task)}
                        disabled={!canComplete}
                        className={`w-full py-2 rounded text-sm ${
                          !canComplete
                            ? 'bg-npu-bg text-npu-muted cursor-not-allowed'
                            : 'bg-npu-border hover:bg-npu-muted text-npu-text'
                        }`}
                      >
                        {!canComplete ? '无法完成' : '执行任务'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Treasure Pavilion */}
          {activeTab === 'shop' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-mono text-lg text-npu-text">兑换中心</h4>
                <div className="flex items-center gap-3">
                  {shopRefreshCooldown > 0 ? (
                    <span className="text-xs text-npu-dim">
                      {Math.floor(shopRefreshCooldown / 60)}:
                      {(shopRefreshCooldown % 60).toString().padStart(2, '0')}{' '}
                      后可刷新
                    </span>
                  ) : (
                    <span className="text-xs text-green-400">可刷新</span>
                  )}
                  <button
                    onClick={handleShopRefresh}
                    disabled={shopRefreshCooldown > 0}
                    className={`px-3 py-1.5 rounded text-sm border flex items-center gap-1.5 transition-colors ${
                      shopRefreshCooldown > 0
                        ? 'bg-npu-panel text-npu-muted border-npu-border cursor-not-allowed'
                        : 'bg-npu-signal/10 hover:bg-npu-signal/20 text-npu-text border-npu-signal'
                    }`}
                    title={
                      shopRefreshCooldown > 0
                        ? `还需等待 ${Math.floor(shopRefreshCooldown / 60)} 分 ${shopRefreshCooldown % 60} 秒`
                        : '刷新兑换中心物品（5分钟冷却）'
                    }
                  >
                    <RefreshCw size={16} />
                    <span>刷新</span>
                  </button>
                </div>
              </div>
              {sectShopItems.map((item, idx) => {
                const quantity = buyQuantities[idx] || 1;
                const totalCost = item.cost * quantity;
                const canBuy = player.sectContribution >= totalCost;

                return (
                  <div
                    key={idx}
                    className="bg-npu-panel p-3 rounded border border-npu-border flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-npu-text">{item.name}</div>
                      <div className="text-xs text-npu-muted">
                        {item.item.description}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-npu-code font-bold">
                        {item.cost} 贡献
                        {quantity > 1 && (
                          <span className="text-xs text-npu-dim ml-1">
                            x{quantity} = {totalCost}
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 border border-npu-border rounded">
                          <button
                            onClick={() =>
                              setBuyQuantities((prev) => ({
                                ...prev,
                                [idx]: Math.max(1, (prev[idx] || 1) - 1),
                              }))
                            }
                            className="px-2 py-1 text-npu-dim hover:text-npu-text"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={quantity}
                            onChange={(e) => {
                              const val = Math.max(
                                1,
                                parseInt(e.target.value) || 1
                              );
                              setBuyQuantities((prev) => ({
                                ...prev,
                                [idx]: val,
                              }));
                            }}
                            className="w-12 text-center bg-transparent text-npu-text border-0 focus:outline-none"
                          />
                          <button
                            onClick={() =>
                              setBuyQuantities((prev) => ({
                                ...prev,
                                [idx]: (prev[idx] || 1) + 1,
                              }))
                            }
                            className="px-2 py-1 text-npu-dim hover:text-npu-text"
                          >
                            +
                          </button>
                        </div>
                        <button
                          onClick={() => {
                            onBuy(item.item, item.cost, quantity);
                            setBuyQuantities((prev) => ({ ...prev, [idx]: 1 }));
                          }}
                          disabled={!canBuy}
                          className={`
                            px-3 py-1.5 rounded text-xs border
                            ${
                              canBuy
                                ? 'bg-npu-border hover:bg-npu-muted text-npu-text border-npu-border'
                                : 'bg-npu-bg text-npu-muted border-npu-border cursor-not-allowed'
                            }
                          `}
                        >
                          兑换
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SectModal;
