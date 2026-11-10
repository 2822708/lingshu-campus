import { CULTIVATION_ARTS, REALM_DATA, REALM_ORDER } from '../../constants';
import { ItemType, RealmType } from '../../types';
import type { CultivationArt } from '../../types';
import { CARDS, STARTER_DECK } from './catalog';
import type {
  CardId,
  TrialBuild,
  TrialLibraryEntry,
  TrialLoadout,
  TrialProfile,
} from './types';

export const MIN_RESUME_CARDS = 8;
export const MAX_RESUME_CARDS = 16;
export const LOADOUT_SAVE_KEY = 'lingshu-card-loadout-v1';
const MAX_PROFILE_STAT = 1e12;
const MAX_IMPORT_SIZE = 2 * 1024 * 1024;
type LoadoutStorage = Pick<Storage, 'getItem' | 'setItem'>;
const PROFILE_FIELDS = [
  'source',
  'name',
  'realm',
  'realmLevel',
  'attack',
  'defense',
  'spirit',
  'physique',
  'speed',
  'maxHp',
  'courseIds',
  'equipment',
];
const ATTRIBUTE_FIELDS = [
  'attack',
  'defense',
  'spirit',
  'physique',
  'speed',
  'maxHp',
] as const;
const COURSE_CARDS: Record<string, CardId> = {
  'art-basic-breath': 'course-code',
  'art-iron-skin': 'course-early',
  'art-spirit-cloud': 'course-math',
  'art-fiery-fist': 'course-algorithms',
  'art-water-mirror': 'course-linear',
  'art-earth-shield': 'course-physics',
};
const SUPPORTED_EQUIPMENT: ReadonlyArray<{
  name: string;
  type: ItemType;
  cardId: CardId;
  demoId: string;
}> = [
  {
    name: '入门薄膜键盘',
    type: ItemType.Weapon,
    cardId: 'gear-keyboard',
    demoId: 'demo:iron-sword',
  },
  {
    name: '军训迷彩服',
    type: ItemType.Armor,
    cardId: 'gear-uniform',
    demoId: 'demo:cloth-robe',
  },
  {
    name: '降噪耳塞',
    type: ItemType.Artifact,
    cardId: 'gear-earplugs',
    demoId: 'demo:noise-earplugs',
  },
  {
    name: '运动护腕',
    type: ItemType.Artifact,
    cardId: 'gear-wrist',
    demoId: 'demo:sport-wrist',
  },
];

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function record(
  value: unknown,
  fields: readonly string[],
  label: string
): asserts value is Record<string, unknown> {
  requireValue(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    `${label}格式无效。`
  );
  requireValue(
    Object.keys(value).every((key) => fields.includes(key)),
    `${label}含有未支持的字段。`
  );
}
function text(
  value: unknown,
  maxLength: number,
  label: string
): asserts value is string {
  requireValue(
    typeof value === 'string' &&
      value.trim().length > 0 &&
      value.length <= maxLength &&
      Array.from(value).every(
        (character) =>
          character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127
      ),
    `${label}格式无效。`
  );
}
function unique(values: readonly string[], label: string) {
  requireValue(
    new Set(values).size === values.length,
    `${label}存在重复条目。`
  );
}
function isRealm(value: unknown): value is RealmType {
  return REALM_ORDER.includes(value as RealmType);
}
function courseCard(art: CultivationArt): CardId {
  if (COURSE_CARDS[art.id]) return COURSE_CARDS[art.id];
  if (art.type === 'mental') {
    if (art.effects.attack) return 'course-math';
    return art.effects.defense ? 'course-linear' : 'course-code';
  }
  return (art.effects.attack ?? 0) > (art.effects.defense ?? 0)
    ? 'course-algorithms'
    : 'course-physics';
}
function cloneProfile(profile: TrialProfile): TrialProfile {
  return {
    ...profile,
    courseIds: [...profile.courseIds],
    equipment: profile.equipment.map((item) => ({ ...item })),
  };
}

export function assertTrialProfile(
  value: unknown
): asserts value is TrialProfile {
  record(value, PROFILE_FIELDS, '角色快照');
  requireValue(
    value.source === 'demo' || value.source === 'import',
    '角色来源无效。'
  );
  text(value.name, 40, '角色姓名');
  requireValue(isRealm(value.realm), '角色学阶无效。');
  requireValue(
    Number.isInteger(value.realmLevel) &&
      Number(value.realmLevel) >= 1 &&
      Number(value.realmLevel) <= 9,
    '角色学阶等级应为 1 到 9。'
  );
  for (const field of ATTRIBUTE_FIELDS) {
    requireValue(
      typeof value[field] === 'number' &&
        Number.isFinite(value[field]) &&
        Number(value[field]) >= (field === 'maxHp' ? 1 : 0) &&
        Number(value[field]) <= MAX_PROFILE_STAT,
      `角色${field}属性无效。`
    );
  }
  requireValue(Array.isArray(value.courseIds), '课程清单无效。');
  const courses = value.courseIds as unknown[];
  for (const id of courses) {
    text(id, 160, '课程编号');
    requireValue(
      CULTIVATION_ARTS.some((art) => art.id === id),
      '角色快照包含未知课程。'
    );
  }
  unique(courses as string[], '课程清单');
  requireValue(Array.isArray(value.equipment), '装备清单无效。');
  const equipment = value.equipment as unknown[];
  for (const item of equipment) {
    record(item, ['id', 'name'], '装备快照');
    text(item.id, 160, '装备编号');
    text(item.name, 40, '装备名称');
    requireValue(
      SUPPORTED_EQUIPMENT.some((supported) => supported.name === item.name),
      '角色快照包含未支持的装备。'
    );
  }
  unique(
    (equipment as Array<{ id: string }>).map((item) => item.id),
    '装备清单'
  );
}

/** 演练角色使用主游戏同学阶基准，不重新施加课程或装备的被动属性。 */
export function createDemoProfile(
  realm: RealmType = RealmType.QiRefining,
  level = 1
): TrialProfile {
  requireValue(isRealm(realm), '演练学阶无效。');
  requireValue(
    Number.isInteger(level) && level >= 1 && level <= 9,
    '演练等级应为 1 到 9。'
  );
  const base = REALM_DATA[realm];
  const scale = 1 + 0.1 * (level - 1);
  const profile: TrialProfile = {
    source: 'demo',
    name: '演练同学',
    realm,
    realmLevel: level,
    attack: Math.floor(base.baseAttack * scale),
    defense: Math.floor(base.baseDefense * scale),
    spirit: Math.floor(base.baseSpirit * scale),
    physique: Math.floor(base.basePhysique * scale),
    speed: Math.floor(base.baseSpeed * scale),
    maxHp: Math.floor(base.baseMaxHp * scale),
    courseIds: CULTIVATION_ARTS.filter(
      (art) =>
        REALM_ORDER.indexOf(art.realmRequirement) <= REALM_ORDER.indexOf(realm)
    ).map((art) => art.id),
    equipment: SUPPORTED_EQUIPMENT.map((item) => ({
      id: item.demoId,
      name: item.name,
    })),
  };
  assertTrialProfile(profile);
  return profile;
}

export function getAvailableEntries(
  profile: TrialProfile
): TrialLibraryEntry[] {
  assertTrialProfile(profile);
  return [
    ...STARTER_DECK.map(
      (cardId, index): TrialLibraryEntry => ({
        id: `base:${index}`,
        cardId,
        source: 'basic',
        sourceId: `base:${index}`,
        label: CARDS[cardId].name,
      })
    ),
    ...profile.courseIds.map((id): TrialLibraryEntry => {
      const art = CULTIVATION_ARTS.find((entry) => entry.id === id)!;
      return {
        id: `course:${id}`,
        cardId: courseCard(art),
        source: 'course',
        sourceId: id,
        label: art.name,
      };
    }),
    ...profile.equipment.map(
      (item): TrialLibraryEntry => ({
        id: `equipment:${item.id}`,
        cardId: SUPPORTED_EQUIPMENT.find(
          (supported) => supported.name === item.name
        )!.cardId,
        source: 'equipment',
        sourceId: item.id,
        label: item.name,
      })
    ),
  ];
}

export function createDefaultLoadout(): TrialLoadout {
  const basic = STARTER_DECK.map((_, index) => `base:${index}`);
  return {
    version: 1,
    profile: createDemoProfile(),
    library: [...basic],
    resume: [...basic],
  };
}

/** 只提取角色与支持来源；不恢复主游戏、日志、互动现场或配置。 */
export function parseProfileSave(raw: string): {
  profile: TrialProfile;
  warnings: string[];
} {
  requireValue(
    typeof raw === 'string' &&
      raw.length <= MAX_IMPORT_SIZE &&
      new TextEncoder().encode(raw).byteLength <= MAX_IMPORT_SIZE,
    '档案文件不能超过 2 MB。'
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('档案不是有效的 JSON 文件。');
  }
  requireValue(
    parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed),
    '档案格式无效。'
  );
  const saved = parsed as Record<string, unknown>;
  requireValue(saved.version === 2, '仅支持主游戏版本 2 的导出档案。');
  requireValue(
    saved.player !== null &&
      typeof saved.player === 'object' &&
      !Array.isArray(saved.player),
    '档案缺少角色数据。'
  );
  const player = saved.player as Record<string, unknown>;
  const warnings: string[] = [];
  const profile: TrialProfile = {
    source: 'import',
    name: player.name as string,
    realm: player.realm as RealmType,
    realmLevel: player.realmLevel as number,
    attack: player.attack as number,
    defense: player.defense as number,
    spirit: player.spirit as number,
    physique: player.physique as number,
    speed: player.speed as number,
    maxHp: player.maxHp as number,
    courseIds: [],
    equipment: [],
  };
  const rawCourses = player.cultivationArts ?? [];
  requireValue(Array.isArray(rawCourses), '档案中的课程清单无效。');
  let unsupportedCourses = 0;
  for (const id of rawCourses) {
    if (typeof id === 'string' && CULTIVATION_ARTS.some((art) => art.id === id))
      profile.courseIds.push(id);
    else unsupportedCourses++;
  }
  if (unsupportedCourses)
    warnings.push(`已忽略 ${unsupportedCourses} 门未支持或无效的课程。`);
  const rawItems = player.inventory ?? [];
  requireValue(Array.isArray(rawItems), '档案中的物品清单无效。');
  const itemIds = new Set<string>();
  let unsupportedItems = 0;
  for (const candidate of rawItems) {
    if (
      candidate === null ||
      typeof candidate !== 'object' ||
      Array.isArray(candidate)
    ) {
      unsupportedItems++;
      continue;
    }
    const item = candidate as Record<string, unknown>;
    if (typeof item.id === 'string' && item.id.length > 0) {
      requireValue(
        !itemIds.has(item.id),
        '档案物品编号重复，无法确定装备来源。'
      );
      itemIds.add(item.id);
    }
    const supported = SUPPORTED_EQUIPMENT.find(
      (entry) => entry.name === item.name && entry.type === item.type
    );
    if (
      !supported ||
      item.isEquippable !== true ||
      typeof item.quantity !== 'number' ||
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      unsupportedItems++;
      continue;
    }
    text(item.id, 160, '装备编号');
    profile.equipment.push({ id: item.id, name: supported.name });
  }
  if (unsupportedItems)
    warnings.push(
      `有 ${unsupportedItems} 件物品未转为卡牌；本版装备仅支持入门薄膜键盘、军训迷彩服、降噪耳塞和运动护腕。`
    );
  assertTrialProfile(profile);
  return { profile, warnings };
}

function assertSelection(
  library: unknown,
  resume: unknown,
  available: readonly TrialLibraryEntry[]
) {
  requireValue(
    Array.isArray(library) && library.every((id) => typeof id === 'string'),
    '牌库清单无效。'
  );
  requireValue(
    Array.isArray(resume) && resume.every((id) => typeof id === 'string'),
    '简历清单无效。'
  );
  unique(library, '牌库');
  unique(resume, '简历');
  const availableIds = new Set(available.map((entry) => entry.id));
  requireValue(
    library.every((id) => availableIds.has(id)),
    '牌库包含未拥有的来源。'
  );
  requireValue(
    STARTER_DECK.every((_, index) => library.includes(`base:${index}`)),
    '基础八张牌必须保留在牌库中。'
  );
  requireValue(
    resume.length <= MAX_RESUME_CARDS,
    `简历至多选择 ${MAX_RESUME_CARDS} 张牌。`
  );
  requireValue(
    resume.every((id) => library.includes(id)),
    '简历包含尚未加入牌库的条目。'
  );
}

export function assertLoadout(value: unknown): asserts value is TrialLoadout {
  record(value, ['version', 'profile', 'library', 'resume'], '牌库配置');
  requireValue(value.version === 1, '牌库配置版本无效。');
  assertTrialProfile(value.profile);
  assertSelection(
    value.library,
    value.resume,
    getAvailableEntries(value.profile)
  );
}

export function getLibraryEntries(loadout: TrialLoadout): TrialLibraryEntry[] {
  assertLoadout(loadout);
  const available = new Map(
    getAvailableEntries(loadout.profile).map((entry) => [entry.id, entry])
  );
  return loadout.library.map((id) => ({ ...available.get(id)! }));
}

export function getLoadoutReason(loadout: TrialLoadout): string | null {
  try {
    assertLoadout(loadout);
  } catch (error) {
    return error instanceof Error ? error.message : '牌库配置无效。';
  }
  if (loadout.resume.length < MIN_RESUME_CARDS)
    return `简历至少选择 ${MIN_RESUME_CARDS} 张牌。`;
  const selected = new Set(loadout.resume);
  if (
    !getLibraryEntries(loadout).some(
      (entry) => selected.has(entry.id) && CARDS[entry.cardId].kind === 'attack'
    )
  )
    return '简历至少需要一张进攻牌。';
  return null;
}

export function createTrialBuild(loadout: TrialLoadout): TrialBuild {
  const reason = getLoadoutReason(loadout);
  requireValue(reason === null, reason ?? '简历无效。');
  const build: TrialBuild = {
    profile: cloneProfile(loadout.profile),
    library: getLibraryEntries(loadout),
    resume: [...loadout.resume],
  };
  assertTrialBuild(build);
  return build;
}

export function assertTrialBuild(value: unknown): asserts value is TrialBuild {
  record(value, ['profile', 'library', 'resume'], '试炼角色快照');
  assertTrialProfile(value.profile);
  requireValue(Array.isArray(value.library), '快照牌库无效。');
  const entries = value.library;
  const expected = getAvailableEntries(value.profile);
  const expectedById = new Map(expected.map((entry) => [entry.id, entry]));
  for (const entry of entries) {
    record(entry, ['id', 'cardId', 'source', 'sourceId', 'label'], '牌库条目');
    const original = expectedById.get(entry.id as string);
    requireValue(
      original &&
        Object.keys(original).every(
          (key) => entry[key] === original[key as keyof TrialLibraryEntry]
        ),
      '快照牌库来源、标签或牌效与角色档案不符。'
    );
  }
  assertSelection(
    entries.map((entry) => entry.id),
    value.resume,
    expected
  );
  const reason = getLoadoutReason({
    version: 1,
    profile: value.profile,
    library: entries.map((entry) => entry.id),
    resume: value.resume as string[],
  });
  requireValue(reason === null, reason ?? '快照简历无效。');
}

export function loadLoadout(storage: LoadoutStorage): {
  loadout: TrialLoadout;
  error: string;
} {
  try {
    const raw = storage.getItem(LOADOUT_SAVE_KEY);
    if (raw === null) return { loadout: createDefaultLoadout(), error: '' };
    const loaded: unknown = JSON.parse(raw);
    assertLoadout(loaded);
    return { loadout: loaded, error: '' };
  } catch {
    return {
      loadout: createDefaultLoadout(),
      error: '独立牌库记录无法读取，原记录已保留；可调整后明确保存新配置。',
    };
  }
}
export function saveLoadout(
  storage: LoadoutStorage,
  loadout: TrialLoadout
): { ok: boolean; error?: string } {
  try {
    assertLoadout(loadout);
    storage.setItem(LOADOUT_SAVE_KEY, JSON.stringify(loadout));
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `简历配置未能保存：${error.message}`
          : '简历配置未能保存，请重试。',
    };
  }
}
