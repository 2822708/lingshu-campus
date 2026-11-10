import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
} from 'react';
import type {
  CSSProperties,
  PointerEvent,
  ReactElement,
  ReactNode,
} from 'react';
import { calculateHandLayout, HAND_CARD_HOVER_SCALE } from './handGeometry';
import type { HandCardShape, HandLayoutBounds } from './handGeometry';

export interface HandLayoutProps {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  /** Omit for the hand hint; explicitly pass undefined for no described-by. */
  hintId?: string;
  /** Formal battle uses height:width 4:3; standalone trial retains its original shape. */
  cardShape?: HandCardShape;
}

type CardSlot = ReactElement<{
  style?: CSSProperties;
  'data-hand-index'?: number;
  'data-compact'?: boolean;
  'data-pointer-active'?: boolean;
}>;
type LayoutStyle = CSSProperties & Record<`--ct-${string}`, string | number>;

const FALLBACK_BOUNDS: HandLayoutBounds = {
  width: 960,
  height: 340,
  left: 16,
  top: 320,
  viewportWidth: 992,
  viewportHeight: 764,
};
const measured = (value: number) => Math.round(value * 2) / 2;
const sameBounds = (before: HandLayoutBounds, after: HandLayoutBounds) =>
  (Object.keys(after) as Array<keyof HandLayoutBounds>).every(
    (key) => before[key] === after[key]
  );

/** Layout only: child buttons keep their existing handlers and disabled state. */
export function HandLayout(props: HandLayoutProps) {
  const { children, className = 'ct-hand', ariaLabel = '全部手牌' } = props;
  const hintId = Object.prototype.hasOwnProperty.call(props, 'hintId')
    ? props.hintId
    : 'ct-hand-hint';
  const slots = Children.toArray(children).filter(isValidElement) as CardSlot[];
  const container = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState(FALLBACK_BOUNDS);
  const [hasMeasured, setHasMeasured] = useState(false);
  const [pointerIndex, setPointerIndex] = useState<number | null>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let frame = 0;
    let active = true;
    const measure = () => {
      frame = 0;
      if (!active) return;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const next: HandLayoutBounds = {
        width: measured(rect.width),
        height: measured(rect.height),
        left: measured(rect.left),
        top: measured(rect.top),
        viewportWidth: measured(window.innerWidth),
        viewportHeight: measured(window.innerHeight),
      };
      setBounds((previous) => (sameBounds(previous, next) ? previous : next));
      setHasMeasured(true);
    };
    const scheduleMeasure = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(scheduleMeasure);
    observer?.observe(element);
    window.addEventListener('resize', scheduleMeasure);
    window.visualViewport?.addEventListener('resize', scheduleMeasure);
    scheduleMeasure();
    return () => {
      active = false;
      observer?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
      window.visualViewport?.removeEventListener('resize', scheduleMeasure);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [slots.length]);

  const layout = calculateHandLayout(slots.length, bounds, props.cardShape);
  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'touch') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const inBaseRow = layout.cards.some(
      (card) => y >= card.y && y <= card.y + card.height
    );
    if (inBaseRow) {
      let nextIndex: number | null = null;
      for (let index = 0; index < layout.cards.length; index++) {
        const card = layout.cards[index];
        if (
          x >= card.x &&
          x <= card.x + card.width &&
          (nextIndex === null || card.x >= layout.cards[nextIndex].x)
        ) {
          nextIndex = index;
        }
      }
      setPointerIndex(nextIndex);
      return;
    }

    // Keep reading a lifted card above the baseline without selecting through it.
    const activeCard =
      pointerIndex === null ? null : layout.cards[pointerIndex];
    if (activeCard) {
      const expandedWidth = activeCard.width * HAND_CARD_HOVER_SCALE;
      const expandedHeight = activeCard.expandedHeight * HAND_CARD_HOVER_SCALE;
      const expandedLeft =
        activeCard.x +
        activeCard.hoverX -
        (expandedWidth - activeCard.width) / 2;
      const expandedTop = activeCard.y + activeCard.hoverY;
      if (
        x >= expandedLeft &&
        x <= expandedLeft + expandedWidth &&
        y >= expandedTop &&
        y <= expandedTop + expandedHeight
      ) {
        return;
      }
    }
    setPointerIndex(null);
  }

  const compact = props.cardShape !== 'portrait-4-3' && layout.cardHeight < 170;
  const style: LayoutStyle = {
    '--ct-hand-card-width': `${layout.cardWidth}px`,
    '--ct-hand-card-height': `${layout.cardHeight}px`,
    '--ct-hand-expanded-height': `${layout.expandedHeight}px`,
    '--ct-hand-columns': layout.columns,
    '--ct-hand-rows': layout.rows,
    '--ct-hand-count': slots.length,
  };

  return (
    <div
      ref={container}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setPointerIndex(null)}
      className={`${className} ct-hand-layout`}
      role="group"
      aria-label={ariaLabel}
      aria-describedby={hintId}
      data-measured={hasMeasured}
      data-card-shape={props.cardShape ?? 'portrait'}
      data-hand-layout={layout.mode}
      data-hand-rows={layout.rows}
      data-hand-columns={layout.columns}
      data-hand-count={slots.length}
      data-hand-card-width={layout.cardWidth}
      data-hand-card-height={layout.cardHeight}
      data-compact={compact}
      style={style}
    >
      {slots.map((slot, index) => {
        const card = layout.cards[index];
        const slotStyle: LayoutStyle = {
          ...slot.props.style,
          '--ct-card-x': `${card.x}px`,
          '--ct-card-y': `${card.y}px`,
          '--ct-card-width': `${card.width}px`,
          '--ct-card-height': `${card.height}px`,
          '--ct-card-expanded-height': `${card.expandedHeight}px`,
          '--ct-card-hover-x': `${card.hoverX}px`,
          '--ct-card-hover-y': `${card.hoverY}px`,
          '--ct-card-order': card.order,
        };
        return cloneElement(slot, {
          style: slotStyle,
          'data-hand-index': index,
          'data-compact': compact,
          'data-pointer-active': pointerIndex === index,
        });
      })}
    </div>
  );
}

export default HandLayout;
