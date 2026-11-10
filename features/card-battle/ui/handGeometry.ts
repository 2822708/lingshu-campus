/** Presentation-only geometry. All positions remain in CSS pixels. */
export interface HandLayoutBounds {
  width: number;
  height: number;
  left: number;
  top: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface HandCardPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  expandedHeight: number;
  hoverX: number;
  hoverY: number;
  order: number;
}

export interface HandLayoutResult {
  mode: 'spread' | 'overlap';
  rows: number;
  columns: number;
  cardWidth: number;
  cardHeight: number;
  expandedHeight: number;
  cards: HandCardPosition[];
}

export type HandCardShape = 'portrait' | 'portrait-4-3';

export const HAND_CARD_EXPANDED_HEIGHT = 232;
export const HAND_CARD_HOVER_SCALE = 1.045;
const CARD_GAP = 12;
const MAX_CARD_HEIGHT = 190;
const VIEWPORT_INSET = 12;

const finite = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback;
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(minimum, maximum), Math.max(minimum, value));
const rounded = (value: number) => Math.round(value * 100) / 100;

/**
 * Keep every card on one baseline. A crowded hand overlaps horizontally instead
 * of wrapping, scrolling, or shrinking the card width and text with its count.
 * Hover offsets match center-top origin with independent CSS translate/scale.
 */
export function calculateHandLayout(
  count: number,
  bounds: HandLayoutBounds,
  cardShape: HandCardShape = 'portrait'
): HandLayoutResult {
  const total = Math.max(0, Math.floor(finite(count, 0)));
  const width = Math.max(1, finite(bounds.width, 960));
  const height = Math.max(1, finite(bounds.height, 340));
  const viewportWidth = Math.max(1, finite(bounds.viewportWidth, width + 32));
  const viewportHeight = Math.max(1, finite(bounds.viewportHeight, 764));
  const left = finite(bounds.left, 16);
  const top = finite(bounds.top, 320);
  // The requested 4:3 is height:width. The unqualified portrait mode retains
  // the standalone trial's earlier collapsed/expanded geometry.
  const fixedPortrait = cardShape === 'portrait-4-3';
  const preferredWidth = viewportWidth <= 600 ? 168 : 192;
  const cardWidth = Math.min(
    preferredWidth,
    width,
    Math.max(1, (viewportWidth - VIEWPORT_INSET * 2) / HAND_CARD_HOVER_SCALE),
    // Normal rows keep the preferred size. Only exceptionally short rows scale
    // both dimensions together, including the hover footprint and footer gap.
    fixedPortrait
      ? Math.max(1, (height - 4) / HAND_CARD_HOVER_SCALE / (4 / 3))
      : Infinity
  );
  const cardHeight = fixedPortrait
    ? cardWidth * (4 / 3)
    : Math.min(MAX_CARD_HEIGHT, height);
  const expandedHeight = fixedPortrait
    ? rounded(cardHeight)
    : HAND_CARD_EXPANDED_HEIGHT;
  const naturalWidth = total ? total * cardWidth + (total - 1) * CARD_GAP : 0;
  const mode = naturalWidth > width ? 'overlap' : 'spread';
  const stepX =
    total > 1
      ? Math.min(
          cardWidth + CARD_GAP,
          Math.max(0, (width - cardWidth) / (total - 1))
        )
      : 0;
  const groupWidth = total ? cardWidth + stepX * (total - 1) : 0;
  const startX = Math.max(0, (width - groupWidth) / 2);
  const y = rounded(
    fixedPortrait
      ? Math.min(8, Math.max(0, height - cardHeight))
      : Math.max(0, (height - cardHeight) / 2)
  );
  const cards: HandCardPosition[] = [];

  for (let index = 0; index < total; index++) {
    const x = rounded(startX + index * stepX);
    const hoverWidth = cardWidth * HAND_CARD_HOVER_SCALE;
    const hoverHeight = expandedHeight * HAND_CARD_HOVER_SCALE;
    const hoveredLeft = left + x - (hoverWidth - cardWidth) / 2;
    const hoveredTop = top + y;
    const boundedLeft = clamp(
      hoveredLeft,
      VIEWPORT_INSET,
      viewportWidth - VIEWPORT_INSET - hoverWidth
    );
    const boundedTop = clamp(
      hoveredTop - 8,
      VIEWPORT_INSET,
      Math.min(
        viewportHeight - VIEWPORT_INSET - hoverHeight,
        top + height - 4 - hoverHeight
      )
    );
    cards.push({
      x,
      y,
      width: rounded(cardWidth),
      height: rounded(cardHeight),
      expandedHeight,
      hoverX: rounded(boundedLeft - hoveredLeft),
      hoverY: rounded(boundedTop - hoveredTop),
      order: index + 1,
    });
  }

  return {
    mode,
    rows: total ? 1 : 0,
    columns: total,
    cardWidth: rounded(cardWidth),
    cardHeight: rounded(cardHeight),
    expandedHeight,
    cards,
  };
}
