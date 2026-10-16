import React, {
  useRef,
  useEffect,
  useState,
  useMemo,
  useCallback,
} from 'react';
import { LogEntry } from '../types';
import { neutralizeCampusText } from '../utils/campusText';

interface Props {
  logs: LogEntry[];
  className?: string;
}

// 限制日志数量，只显示最近500条，避免DOM过多导致卡顿
const MAX_LOGS = 500;

const LOG_LABEL: Record<LogEntry['type'], string> = {
  normal: '日常',
  gain: '收获',
  danger: '提醒',
  special: '成长',
};

// 单个日志项组件，使用 memo 优化
const LogItem = React.memo<{ log: LogEntry }>(({ log }) => {
  const timeString = useMemo(
    () => new Date(log.timestamp).toLocaleTimeString(),
    [log.timestamp]
  );

  return (
    <article
      className={`campus-journal__entry campus-journal__entry--${log.type}`}
    >
      <time className="campus-journal__time">{timeString}</time>
      <div className="campus-journal__entry-body">
        <span className="campus-journal__label">
          {LOG_LABEL[log.type] ?? LOG_LABEL.normal}
        </span>
        <p className="campus-journal__text">{neutralizeCampusText(log.text)}</p>
      </div>
    </article>
  );
});

LogItem.displayName = 'LogItem';

const LogPanel: React.FC<Props> = ({ logs, className }) => {
  const endRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const lastLogIdRef = useRef<string | null>(null);
  const shouldAutoScrollRef = useRef(true); // 跟踪是否应该自动滚动
  // 分页窗口：初始只渲染最近 150 条，可向上加载更早的
  const INITIAL_VISIBLE = 150;
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  // 限制日志数量，只显示最近的部分（分页窗口，DOM 数量可控）
  const displayedLogs = useMemo(() => {
    const capped = logs.length > MAX_LOGS ? logs.slice(-MAX_LOGS) : logs;
    return capped.slice(-Math.min(visibleCount, capped.length));
  }, [logs, visibleCount]);

  const initialDisplayedLogCount = useRef(displayedLogs.length);

  // 是否还有更早的日志可加载
  const hasMoreOlder = useMemo(() => {
    const capped = logs.length > MAX_LOGS ? logs.slice(-MAX_LOGS) : logs;
    return capped.length > displayedLogs.length;
  }, [logs, displayedLogs.length]);

  // 检查是否在底部
  const checkIfAtBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return true;

    const { scrollTop, scrollHeight, clientHeight } = container;
    // 计算距离底部的距离
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    // 如果距离底部小于等于 50px，认为在底部（增加容差，避免频繁切换）
    return distanceFromBottom <= 50;
  }, []);

  // 当有新日志时，如果用户在底部，自动滚动到底部
  useEffect(() => {
    const container = containerRef.current;
    if (!container || logs.length === 0) return;

    const lastLog = logs[logs.length - 1];
    const hasNewLog = lastLog.id !== lastLogIdRef.current;

    if (hasNewLog) {
      lastLogIdRef.current = lastLog.id;

      // 检查用户是否在底部
      const isAtBottom = checkIfAtBottom();
      shouldAutoScrollRef.current = isAtBottom;

      if (!isAtBottom) {
        // 使用 requestAnimationFrame 确保 DOM 更新后再滚动
        requestAnimationFrame(() => {
          endRef.current?.scrollIntoView({ behavior: 'smooth' });
        });
      }
    }

    // 延迟检查是否在底部，更新滚动按钮状态
    const timer = setTimeout(() => {
      const isAtBottom = checkIfAtBottom();
      setShowScrollButton(!isAtBottom);
      shouldAutoScrollRef.current = isAtBottom;
    }, 200);

    return () => clearTimeout(timer);
  }, [logs, checkIfAtBottom]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const isAtBottom = checkIfAtBottom();
      setShowScrollButton(!isAtBottom);
      // 更新自动滚动状态：如果用户手动滚动到底部，则允许自动滚动
      shouldAutoScrollRef.current = isAtBottom;
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    // 初始检查
    handleScroll();

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [checkIfAtBottom]);

  // 初始化时滚动到底部
  useEffect(() => {
    if (initialDisplayedLogCount.current > 0) {
      requestAnimationFrame(() => {
        endRef.current?.scrollIntoView({ behavior: 'auto' });
      });
    }
  }, []); // 只在组件挂载时执行一次

  const scrollToBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth',
    });

    // 更新自动滚动状态
    shouldAutoScrollRef.current = true;

    // 延迟隐藏按钮，等待滚动完成
    setTimeout(() => {
      setShowScrollButton(false);
    }, 300);
  }, []);

  return (
    <section
      className={`campus-journal ${className || ''}`}
      aria-label="校园手记"
    >
      <header className="campus-journal__header">
        <h2>校园手记</h2>
        <span>学习 · 探索 · 成长</span>
      </header>
      {/* 滚动容器 */}
      <div ref={containerRef} className="campus-journal__scroll">
        <div className="campus-journal__pages">
          {/* 加载更早日志 */}
          {hasMoreOlder && (
            <div className="campus-journal__older">
              <button
                onClick={() => setVisibleCount((c) => c + INITIAL_VISIBLE)}
                className="campus-journal__older-button"
              >
                查看更早的手记（还有 {logs.length - displayedLogs.length} 条）
              </button>
            </div>
          )}
          {displayedLogs.length === 0 && (
            <p className="campus-journal__empty">
              新的一页，从今天的校园生活写起。
            </p>
          )}
          {displayedLogs.map((log) => (
            <LogItem key={log.id} log={log} />
          ))}
          <div ref={endRef} />
        </div>
      </div>

      {/* 滚动到底部按钮 - 固定在日志窗口右下角，不随内容滚动 */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="campus-journal__latest"
          title="回到最新手记"
          aria-label="回到最新手记"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-5 h-5 md:w-6 md:h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        </button>
      )}
    </section>
  );
};

export default React.memo(LogPanel);
