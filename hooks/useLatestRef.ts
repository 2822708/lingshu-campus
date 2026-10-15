import { useLayoutEffect, useRef } from 'react';

/** 更新回调所读的快照，而不因回调重建而重启定时器或重新触发随机操作。 */
export function useLatestRef<T>(value: T) {
  const latest = useRef(value);
  useLayoutEffect(() => {
    latest.current = value;
  }, [value]);
  return latest;
}
