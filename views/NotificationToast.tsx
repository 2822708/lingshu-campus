import React from 'react';
import { LogEntry } from '../types';

interface PurchaseSuccessProps {
  item: string;
  quantity: number;
}
/**
 *
 * @param item 物品名称
 * @param quantity 物品数量
 * 购买成功弹窗
 * @returns
 */
export function PurchaseSuccessToast({ item, quantity }: PurchaseSuccessProps) {
  return (
    <div className="paper-toast-wrapper" role="status" aria-live="polite">
      <div className="paper-toast">
        <div className="flex items-center gap-3">
          <span className="text-npu-code" aria-hidden="true">
            ✓
          </span>
          <div>
            <div className="font-semibold">购买成功</div>
            <div className="text-sm">
              获得 {item} x{quantity}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ItemActionToastProps {
  log: LogEntry | null;
}

/**
 * 物品使用/装备后的轻提示组件
 * 显示与LogPanel相同格式的内容
 */
export function ItemActionToast({ log }: ItemActionToastProps) {
  if (!log) return null;

  const logClassName = (() => {
    const baseClass = 'paper-toast text-sm';
    switch (log.type) {
      case 'normal':
        return `${baseClass} text-npu-text`;
      case 'gain':
        return `${baseClass} text-npu-code`;
      case 'danger':
        return `${baseClass} text-npu-warn`;
      case 'special':
        return `${baseClass} text-npu-text`;
      default:
        return `${baseClass} text-npu-text`;
    }
  })();

  return (
    <div className="paper-toast-wrapper" role="status" aria-live="polite">
      <div className={logClassName}>{log.text}</div>
    </div>
  );
}

interface LotteryRewardsProps {
  rewards: Array<{ type: string; name: string; quantity?: number }>;
}

export function LotteryRewardsToast({ rewards }: LotteryRewardsProps) {
  if (rewards.length === 0) return null;

  return (
    <div className="paper-toast-wrapper" role="status" aria-live="polite">
      <div className="paper-toast">
        <div className="flex flex-col items-center gap-3">
          <div className="font-semibold">本次抽奖获得</div>
          <div className="w-full space-y-2 max-h-60 overflow-y-auto">
            {rewards.map((reward, idx) => (
              <div
                key={idx}
                className="border-b border-npu-border py-2 flex items-center justify-between gap-6"
              >
                <span className="font-semibold">{reward.name}</span>
                {reward.quantity !== undefined && (
                  <span className="text-npu-code font-semibold">
                    x{reward.quantity}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
