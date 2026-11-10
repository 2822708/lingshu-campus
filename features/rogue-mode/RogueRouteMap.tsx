import { useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import {
  CircleHelp,
  Crown,
  Flame,
  ShieldAlert,
  Store,
  Swords,
} from 'lucide-react';
import { getBoss, getChapter } from './catalog';
import { getRogueMap, getRogueMapChoices } from './routeMap';
import type { RogueMapNode } from './routeMap';
import type { RogueNodeKind, RogueRun } from './types';
import './rogue-route-map.css';

const MARKS = {
  battle: { label: '遭遇', Icon: Swords },
  elite: { label: '精英', Icon: ShieldAlert },
  event: { label: '机缘', Icon: CircleHelp },
  shop: { label: '工坊', Icon: Store },
  camp: { label: '调息', Icon: Flame },
  boss: { label: '考核', Icon: Crown },
};

export function getRogueNodeLabel(kind: RogueNodeKind): string {
  return MARKS[kind].label;
}

const WIDTH = 640;
const HEIGHT = 580;
const FIRST_Y = 530;
const STEP = 54;

function point({ floor, lane }: Pick<RogueMapNode, 'floor' | 'lane'>) {
  return {
    x: (lane + 1) * 128,
    y: FIRST_Y - ((floor - 1) % 10) * STEP,
  };
}

function mapPosition(node: RogueMapNode): CSSProperties {
  const { x, y } = point(node);
  return { left: `${(x / WIDTH) * 100}%`, top: `${(y / HEIGHT) * 100}%` };
}

interface Props {
  run: RogueRun;
  onChoose?: (id: string) => void;
  busy?: boolean;
}

export default function RogueRouteMap({ run, onChoose, busy = false }: Props) {
  const chapter = getChapter(run.floor);
  const boss = getBoss(chapter);
  const nodes = useMemo(
    () => getRogueMap(run.seed, chapter),
    [run.seed, chapter]
  );
  const byId = new Map<string, RogueMapNode>(
    nodes.map((node) => [node.id, node])
  );
  const path = run.map?.path ?? [];
  const trail = new Map(path.slice(1).map((id, index) => [path[index], id]));
  const visited = new Set(path);
  const previousId = path.at(-1);
  const current = previousId ? byId.get(previousId) : undefined;
  const choosing = run.phase === 'route' && Boolean(onChoose);
  const choices = choosing
    ? getRogueMapChoices(run.seed, run.floor, previousId)
    : [];
  const available = new Set(choices.map(({ id }) => id));
  const ahead = new Set(available);
  for (const node of [...nodes].sort((a, b) => a.floor - b.floor)) {
    if (ahead.has(node.id)) node.next.forEach((id) => ahead.add(id));
  }

  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const focusFloor =
    run.phase === 'route' ? run.floor : (current?.floor ?? run.floor);
  const focusY = point({ floor: focusFloor, lane: 0 }).y / HEIGHT;

  useEffect(() => {
    const view = viewport.current;
    const board = canvas.current;
    if (!view || !board) return;
    const positionCurrentFloor = () => {
      const anchor = Math.max(
        0,
        Math.min(view.clientHeight * 0.8, view.clientHeight - 48)
      );
      view.scrollTop = focusY * board.offsetHeight - anchor;
    };
    positionCurrentFloor();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(positionCurrentFloor);
      observer.observe(view);
      observer.observe(board);
      return () => observer.disconnect();
    }
  }, [focusY, chapter]);

  return (
    <section className="rm-route" aria-label={`第${chapter}章路线图`}>
      <header className="rm-route-heading">
        <div>
          <p className="rm-route-kicker">
            第{chapter}章 · {boss.name}
          </p>
          <h2>本章路线图</h2>
        </div>
        <p className="rm-route-position">
          {current
            ? `位置 · 第${current.floor}关 ${getRogueNodeLabel(current.kind)}`
            : '位置 · 试境入口'}
          {choosing && (
            <strong>
              第{run.floor}关可选 {choices.length} 处
            </strong>
          )}
        </p>
      </header>
      <div
        className="rm-route-viewport"
        ref={viewport}
        role="region"
        aria-label="试境地图，可上下滚动查看"
        tabIndex={0}
      >
        <div className="rm-route-canvas" ref={canvas}>
          <svg
            className="rm-route-edges"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {nodes.flatMap((node) => {
              const from = point(node);
              return node.next.map((id) => {
                const target = byId.get(id);
                if (!target) return null;
                const to = point(target);
                const state =
                  trail.get(node.id) === id
                    ? 'traveled'
                    : node.id === current?.id && available.has(id)
                      ? 'available'
                      : choosing && !ahead.has(id)
                        ? 'skipped'
                        : 'future';
                return (
                  <line
                    key={`${node.id}:${id}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    data-edge-state={state}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              });
            })}
          </svg>
          {Array.from({ length: 10 }, (_, index) => {
            const floor = (chapter - 1) * 10 + index + 1;
            return (
              <span
                className="rm-route-floor"
                aria-hidden="true"
                key={floor}
                data-focus={floor === focusFloor || undefined}
                style={{
                  top: `${(point({ floor, lane: 0 }).y / HEIGHT) * 100}%`,
                }}
              >
                {String(floor).padStart(2, '0')}
              </span>
            );
          })}
          {nodes.map((node) => {
            const { label, Icon } = MARKS[node.kind];
            const name = node.kind === 'boss' ? boss.name : label;
            const state = available.has(node.id)
              ? 'available'
              : current?.id === node.id
                ? 'current'
                : visited.has(node.id)
                  ? 'visited'
                  : 'locked';
            const status = {
              available: '可前往',
              current: '当前位置',
              visited: '已走过',
              locked: '暂不可前往',
            }[state];
            const column =
              node.kind === 'boss' ? '' : `第${node.lane + 1}列 · `;
            const title = `第${node.floor}关 · ${column}${name} · ${status}`;
            const content = (
              <>
                <Icon aria-hidden="true" strokeWidth={1.8} />
                {(state === 'available' || node.kind === 'boss') && (
                  <span className="rm-route-node-label" aria-hidden="true">
                    {name}
                  </span>
                )}
              </>
            );
            const props = {
              className: 'rm-route-node',
              style: mapPosition(node),
              title,
              'aria-label': title,
              'aria-current':
                state === 'current' ? ('step' as const) : undefined,
              'data-node-id': node.id,
              'data-floor': node.floor,
              'data-kind': node.kind,
              'data-state': state,
              'data-skipped':
                (choosing && state === 'locked' && !ahead.has(node.id)) ||
                undefined,
            };
            return state === 'available' ? (
              <button
                key={node.id}
                {...props}
                type="button"
                disabled={busy}
                onClick={() => onChoose?.(node.id)}
              >
                {content}
              </button>
            ) : (
              <span key={node.id} {...props} role="img">
                {content}
              </span>
            );
          })}
          <span className="rm-route-origin" aria-hidden="true">
            ↑ 试境入口
          </span>
        </div>
      </div>
      <footer className="rm-route-footer">
        <p>
          {choosing
            ? '从下往上，只能进入相连的亮色节点。'
            : '沿连线向上查看后续试境。'}
        </p>
        <ul aria-label="节点图例">
          {Object.entries(MARKS).map(([kind, { label, Icon }]) => (
            <li key={kind} data-kind={kind}>
              <Icon aria-hidden="true" strokeWidth={1.8} />
              {label}
            </li>
          ))}
        </ul>
      </footer>
    </section>
  );
}
