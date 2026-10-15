/**
 * 排行榜面板
 *
 * - 4 个榜单 tab：学分 / 绩点 / 学阶 / 时长
 * - 每个榜单只显示前 100 名
 * - 当前玩家名字高亮
 * - 网络失败静默降级（显示"暂无法连接排行榜服务"）
 */

import React, { useState, useEffect } from 'react';
import { X, Trophy, RefreshCw, AlertCircle } from 'lucide-react';
import {
  fetchLeaderboard,
  LeaderboardType,
  LeaderboardEntry,
  LeaderboardResponse,
} from '../utils/leaderboardApi';

interface LeaderboardPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlayerName?: string;
}

const TABS: Array<{ type: LeaderboardType; label: string; unit: string; icon: string }> = [
  { type: 'credits',  label: '学分榜',     unit: '学分',   icon: '💎' },
  { type: 'exp',      label: '绩点榜',     unit: '绩点',   icon: '📚' },
  { type: 'realm',    label: '学阶榜',     unit: '学阶',   icon: '🎓' },
  { type: 'playtime', label: '时长榜',     unit: '秒',     icon: '⏱' },
];

const LeaderboardPanel: React.FC<LeaderboardPanelProps> = ({
  isOpen,
  onClose,
  currentPlayerName,
}) => {
  const [activeType, setActiveType] = useState<LeaderboardType>('credits');
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (type: LeaderboardType) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetchLeaderboard(type, 100);
      if (!resp) {
        setError('暂无法连接排行榜服务（网络/服务器/CORS）');
        setData(null);
      } else {
        setData(resp);
      }
    } catch (e) {
      setError('加载失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) load(activeType);
  }, [isOpen, activeType]);

  if (!isOpen) return null;

  const activeTab = TABS.find((t) => t.type === activeType)!;

  return (
    <div
      className="fixed inset-0 paper-overlay flex items-center justify-center z-50 p-4 font-mono"
      onClick={onClose}
    >
      <div
        className="bg-npu-panel border border-npu-border w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="bg-npu-bg border-b border-npu-border p-3 md:p-4 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-2 text-npu-code">
            <Trophy size={20} />
            <span className="text-lg font-bold">排行榜</span>
            <span className="text-[10px] text-npu-muted">[前 100 名]</span>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="text-npu-dim hover:text-npu-text min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X size={20} />
          </button>
        </div>

        {/* 4 个 tab */}
        <div className="border-b border-npu-border flex-shrink-0 grid grid-cols-4">
          {TABS.map((t) => (
            <button
              key={t.type}
              onClick={() => setActiveType(t.type)}
              className={[
                'py-2.5 px-2 text-xs md:text-sm transition-colors border-b-2',
                activeType === t.type
                  ? 'text-npu-code border-npu-code bg-npu-code/10'
                  : 'text-npu-dim border-transparent hover:text-npu-text',
              ].join(' ')}
            >
              <div className="text-base mb-0.5">{t.icon}</div>
              <div className="font-bold">{t.label}</div>
            </button>
          ))}
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-3 md:p-4 min-h-0">
          {loading && (
            <div className="text-center text-npu-dim py-10">
              <RefreshCw size={20} className="animate-spin inline mr-2" />
              加载中...
            </div>
          )}

          {error && !loading && (
            <div className="bg-npu-warn/10 border border-npu-warn text-npu-warn p-3 text-xs flex items-start gap-2">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-bold mb-1">加载失败</div>
                <div>{error}</div>
                <button
                  onClick={() => load(activeType)}
                  className="mt-2 px-3 py-1 border border-npu-warn text-npu-warn text-xs hover:bg-npu-warn hover:text-npu-bg"
                >
                  重试
                </button>
              </div>
            </div>
          )}

          {data && !loading && !error && (
            <>
              {data.entries.length === 0 ? (
                <div className="text-center text-npu-dim py-10">
                  <div className="mb-2 text-3xl">🌱</div>
                  <div className="text-sm">还没有人上榜</div>
                  <div className="text-[10px] text-npu-muted mt-1">
                    （达到&quot;硕士&quot;学阶后自动上榜）
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  {/* 前 3 名特殊高亮 */}
                  {data.entries.slice(0, 3).map((e) => (
                    <Row
                      key={`top-${e.rank}`}
                      entry={e}
                      unit={activeTab.unit}
                      isCurrentPlayer={(e.displayName || e.name) === currentPlayerName}
                      highlight="top3"
                    />
                  ))}

                  {/* 第 4 名及之后 */}
                  {data.entries.slice(3).map((e) => (
                    <Row
                      key={e.rank}
                      entry={e}
                      unit={activeTab.unit}
                      isCurrentPlayer={(e.displayName || e.name) === currentPlayerName}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* 底部说明 */}
        {data && data.entries.length > 0 && (
          <div className="border-t border-npu-border p-2 text-center text-[10px] text-npu-muted flex-shrink-0">
            共 {data.total} 人上榜 · 本榜单每 60 秒自动更新
          </div>
        )}
      </div>
    </div>
  );
};

interface RowProps {
  entry: LeaderboardEntry;
  unit: string;
  isCurrentPlayer: boolean;
  highlight?: 'top3';
}

const Row: React.FC<RowProps> = ({ entry, unit, isCurrentPlayer, highlight }) => {
  // 直接从 entry 字段取值
  const display = (() => {
    if (unit === '学分') return entry.credits.toLocaleString();
    if (unit === '绩点') return entry.exp.toLocaleString();
    if (unit === '学阶') return `${entry.realm} Lv.${entry.realm_level}`;
    const h = Math.floor(entry.playtime_seconds / 3600);
    const m = Math.floor((entry.playtime_seconds % 3600) / 60);
    const s = entry.playtime_seconds % 60;
    return h > 0 ? `${h}h${m}m` : m > 0 ? `${m}m${s}s` : `${s}s`;
  })();

  const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`;

  return (
    <div
      className={[
        'flex items-center gap-2 p-2 border transition-colors',
        isCurrentPlayer
          ? 'border-npu-code bg-npu-code/15 ring-1 ring-npu-code'
          : highlight === 'top3'
            ? 'border-npu-border bg-npu-bg'
            : 'border-npu-border bg-npu-panel hover:bg-npu-bg',
      ].join(' ')}
    >
      <div
        className={[
          'w-10 text-center text-xs font-bold flex-shrink-0',
          highlight === 'top3' ? 'text-base' : 'text-npu-muted',
          isCurrentPlayer ? 'text-npu-code' : '',
        ].join(' ')}
      >
        {medal}
      </div>
      <div className="flex-1 min-w-0">
        <div className={['text-sm truncate', isCurrentPlayer ? 'text-npu-code font-bold' : 'text-npu-text'].join(' ')}>
          {entry.displayName || entry.name}
          {isCurrentPlayer && <span className="ml-1 text-[10px] text-npu-code">[我]</span>}
        </div>
        <div className="text-[10px] text-npu-muted">
          {entry.realm} Lv.{entry.realm_level}
        </div>
      </div>
      <div
        className={[
          'text-sm font-bold text-right flex-shrink-0',
          highlight === 'top3' ? 'text-npu-code' : 'text-npu-text',
        ].join(' ')}
      >
        {display}
      </div>
    </div>
  );
};

export default LeaderboardPanel;
