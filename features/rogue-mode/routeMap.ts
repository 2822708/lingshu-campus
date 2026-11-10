import type { RogueNodeKind } from './types';

export interface RogueMapNode {
  id: string;
  floor: number;
  lane: number;
  kind: RogueNodeKind;
  next: string[];
}

export interface RogueMapProgress {
  version: 1;
  startFloor: number;
  path: string[];
}

const LANES = [0, 1, 2, 3];
const FLOORS_PER_CHAPTER = 10;
const TOTAL_FLOORS = 50;

// The first three entries keep each floor's mix when a lane is omitted.
const FLOOR_KINDS: readonly (readonly RogueNodeKind[])[] = [
  ['battle', 'battle', 'battle', 'battle'],
  ['battle', 'event', 'battle', 'event'],
  ['event', 'battle', 'shop', 'event'],
  ['elite', 'battle', 'battle', 'elite'],
  ['camp', 'shop', 'event', 'camp'],
  ['battle', 'battle', 'battle', 'battle'],
  ['shop', 'battle', 'event', 'shop'],
  ['elite', 'battle', 'elite', 'battle'],
  ['camp', 'camp', 'camp', 'camp'],
];

function chapterRandom(seed: number, chapter: number) {
  let state = (seed ^ Math.imul(chapter, 0x9e3779b1)) >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  return (size: number) => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) % size;
  };
}

function shuffled<T>(items: readonly T[], nextIndex: (size: number) => number) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = nextIndex(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function connectRows(
  lower: RogueMapNode[],
  upper: RogueMapNode[],
  nextIndex: (size: number) => number
) {
  // Pair both rows in lane order. At a width change, one lane splits or merges.
  const sharedLane = nextIndex(Math.min(lower.length, upper.length));
  const edges: Array<{ from: RogueMapNode; to: RogueMapNode }> = [];
  const connect = (from: RogueMapNode, to: RogueMapNode) => {
    edges.push({ from, to });
    from.next.push(to.id);
  };
  for (let index = 0; index < Math.max(lower.length, upper.length); index++) {
    const lowerIndex =
      lower.length < upper.length && index > sharedLane ? index - 1 : index;
    const upperIndex =
      upper.length < lower.length && index > sharedLane ? index - 1 : index;
    connect(lower[lowerIndex], upper[upperIndex]);
  }

  const candidates = lower.flatMap((from) =>
    upper
      .filter(
        (to) => Math.abs(from.lane - to.lane) <= 1 && !from.next.includes(to.id)
      )
      .map((to) => ({ from, to }))
  );
  let extra = 1 + nextIndex(2);
  for (const { from, to } of shuffled(candidates, nextIndex)) {
    if (
      edges.some(
        (edge) => (edge.from.lane - from.lane) * (edge.to.lane - to.lane) < 0
      )
    )
      continue;
    connect(from, to);
    extra--;
    if (extra === 0) break;
  }
}

/** Map version 1. Generate from the run seed without consuming combat RNG. */
export function getRogueMap(seed: number, chapter: number): RogueMapNode[] {
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > 5)
    throw new Error('章节必须为1–5。');

  const nextIndex = chapterRandom(seed, chapter);
  const firstFloor = (chapter - 1) * FLOORS_PER_CHAPTER + 1;
  const rows = FLOOR_KINDS.map((kinds, index): RogueMapNode[] => {
    const omittedLane = nextIndex(3) === 0 ? -1 : nextIndex(LANES.length);
    const lanes = LANES.filter((lane) => lane !== omittedLane);
    const roomKinds = shuffled(kinds.slice(0, lanes.length), nextIndex);
    const floor = firstFloor + index;
    return lanes.map((lane, laneIndex) => ({
      id: `floor-${floor}-lane-${lane}`,
      floor,
      lane,
      kind: roomKinds[laneIndex],
      next: [],
    }));
  });
  for (let row = 0; row < rows.length - 1; row++)
    connectRows(rows[row], rows[row + 1], nextIndex);

  const bossFloor = chapter * FLOORS_PER_CHAPTER;
  const boss: RogueMapNode = {
    id: `floor-${bossFloor}-boss`,
    floor: bossFloor,
    lane: 1.5,
    kind: 'boss',
    next: [],
  };
  for (const node of rows[rows.length - 1]) node.next.push(boss.id);
  return [...rows.flat(), boss];
}

function mapForFloor(seed: number, floor: number): RogueMapNode[] {
  if (!Number.isInteger(floor) || floor < 1 || floor > TOTAL_FLOORS) return [];
  return getRogueMap(seed, Math.ceil(floor / FLOORS_PER_CHAPTER));
}

export function getRogueMapChoices(
  seed: number,
  floor: number,
  previousId?: string
): RogueMapNode[] {
  const map = mapForFloor(seed, floor);
  const row = map.filter((node) => node.floor === floor);
  if ((floor - 1) % FLOORS_PER_CHAPTER === 0) return row;
  const previous = map.find(
    (node) => node.floor === floor - 1 && node.id === previousId
  );
  return previous ? row.filter((node) => previous.next.includes(node.id)) : [];
}

export function getRogueMapNode(
  seed: number,
  floor: number,
  id: string
): RogueMapNode | undefined {
  return mapForFloor(seed, floor).find(
    (node) => node.floor === floor && node.id === id
  );
}
