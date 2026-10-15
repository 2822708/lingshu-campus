import { useState, useEffect, useRef } from 'react';
import { PlayerStats } from '../../types';

export function useGameCooldown(player: PlayerStats | null) {
  const [loading, setLoading] = useState(false);
  // 用 ref 存当前值，ActionBar 订阅一个简单的 tick state 来重渲染
  const cooldownRef = useRef(0);
  const [tick, setTick] = useState(0);
  const hasPlayer = Boolean(player);

  useEffect(() => {
    if (!hasPlayer) return;

    const timer = setInterval(() => {
      if (document.hidden) return; // 后台不递减
      cooldownRef.current = Math.max(0, cooldownRef.current - 1);
      setTick((t) => (t + 1) % 1000000); // 触发依赖此值的组件重渲染
    }, 1000);
    return () => clearInterval(timer);
  }, [hasPlayer]); // 只在玩家存在性变化时建一次

  // 让强制 setCooldown 立即生效
  const setCooldown = (v: number) => {
    cooldownRef.current = Math.max(0, v);
    setTick((t) => (t + 1) % 1000000);
  };

  return { loading, setLoading, cooldown: cooldownRef.current, setCooldown, _tick: tick };
}
