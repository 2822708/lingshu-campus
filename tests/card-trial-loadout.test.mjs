import test from 'node:test';
import assert from 'node:assert/strict';
import { CULTIVATION_ARTS, REALM_DATA, REALM_ORDER } from '../constants';
import { ItemType, RealmType } from '../types';
import { CARDS, STARTER_DECK } from '../prototypes/card-trial/catalog';
import {
  MIN_RESUME_CARDS,
  MAX_RESUME_CARDS,
  LOADOUT_SAVE_KEY,
  assertTrialProfile,
  assertLoadout,
  assertTrialBuild,
  createDemoProfile,
  createDefaultLoadout,
  getAvailableEntries,
  getLibraryEntries,
  getLoadoutReason,
  createTrialBuild,
  parseProfileSave,
  loadLoadout,
  saveLoadout,
} from '../prototypes/card-trial/loadout';

function exportedPlayer(overrides = {}) {
  return {
    name: '测试同学',
    realm: RealmType.Foundation,
    realmLevel: 3,
    attack: 88,
    defense: 44,
    spirit: 39,
    physique: 67,
    speed: 45,
    maxHp: 786,
    cultivationArts: ['art-basic-breath', 'art-spirit-cloud'],
    activeArtId: 'art-water-mirror',
    inventory: [
      {
        id: 'owned-keyboard',
        name: '入门薄膜键盘',
        type: ItemType.Weapon,
        quantity: 1,
        isEquippable: true,
        effect: { attack: 50000 },
        rarity: '绝版',
      },
      {
        id: 'owned-uniform',
        name: '军训迷彩服',
        type: ItemType.Armor,
        quantity: 1,
        isEquippable: true,
      },
      {
        id: 'owned-earplugs',
        name: '降噪耳塞',
        type: ItemType.Artifact,
        quantity: 1,
        isEquippable: true,
      },
      {
        id: 'owned-wrist',
        name: '运动护腕',
        type: ItemType.Artifact,
        quantity: 1,
        isEquippable: true,
      },
    ],
    equippedItems: { 键鼠: 'owned-keyboard' },
    ...overrides,
  };
}
function exportRaw(player = exportedPlayer(), extra = {}) {
  return JSON.stringify({
    version: 2,
    player,
    logs: [{ text: '无关历史记录' }],
    interactive: { ignored: true },
    timestamp: 123,
    settings: { apiKey: 'ignored-placeholder' },
    ...extra,
  });
}
function allSourcesLoadout() {
  const loadout = createDefaultLoadout();
  loadout.profile = createDemoProfile(RealmType.ImmortalAscension, 9);
  loadout.library = getAvailableEntries(loadout.profile).map(
    (entry) => entry.id
  );
  return loadout;
}
function store(raw = null) {
  const data = new Map([['npu-game-save', 'main-game-sentinel']]);
  if (raw !== null) data.set(LOADOUT_SAVE_KEY, raw);
  const writes = [];
  const reads = [];
  let fail = false;
  return {
    data,
    writes,
    reads,
    getItem(key) {
      reads.push(key);
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      writes.push(key);
      if (fail) throw new Error('quota');
      data.set(key, value);
    },
    fail(value) {
      fail = value;
    },
  };
}

test('默认牌库及简历只含基础八个独立实例，不自动装入课程装备', () => {
  const loadout = createDefaultLoadout();
  assert.equal(MIN_RESUME_CARDS, 8);
  assert.equal(MAX_RESUME_CARDS, 16);
  assertLoadout(loadout);
  assert.deepEqual(
    loadout.library,
    STARTER_DECK.map((_, index) => `base:${index}`)
  );
  assert.deepEqual(loadout.resume, loadout.library);
  assert.notEqual(loadout.resume, loadout.library);
  const entries = getAvailableEntries(loadout.profile);
  assert.ok(entries.length > loadout.library.length);
  assert.deepEqual(
    getLibraryEntries(loadout).map((entry) => entry.cardId),
    STARTER_DECK
  );
  assert.equal(getLoadoutReason(loadout), null);
  loadout.resume.pop();
  assert.equal(loadout.library.length, 8);
});

test('演练角色沿用真实学阶基准与学阶内倍率，不重复叠加课程装备属性', () => {
  for (const realm of REALM_ORDER) {
    const profile = createDemoProfile(realm, 7);
    assertTrialProfile(profile);
    const base = REALM_DATA[realm];
    const scale = 1.6;
    assert.equal(profile.attack, Math.floor(base.baseAttack * scale));
    assert.equal(profile.defense, Math.floor(base.baseDefense * scale));
    assert.equal(profile.spirit, Math.floor(base.baseSpirit * scale));
    assert.equal(profile.physique, Math.floor(base.basePhysique * scale));
    assert.equal(profile.speed, Math.floor(base.baseSpeed * scale));
    assert.equal(profile.maxHp, Math.floor(base.baseMaxHp * scale));
    assert.equal(profile.equipment.length, 4);
    assert.ok(profile.equipment.every((item) => item.id.startsWith('demo:')));
    assert.ok(
      profile.courseIds.every(
        (id) =>
          REALM_ORDER.indexOf(
            CULTIVATION_ARTS.find((art) => art.id === id).realmRequirement
          ) <= REALM_ORDER.indexOf(realm)
      )
    );
  }
  assert.throws(() => createDemoProfile('不存在的学阶'));
  assert.throws(() => createDemoProfile(RealmType.QiRefining, 0));
  assert.throws(() => createDemoProfile(RealmType.QiRefining, 1.5));
});

test('所有已学17门真实课程保留名称与业务ID，六个明确模板映射正确', () => {
  const profile = createDemoProfile(RealmType.ImmortalAscension);
  const courses = getAvailableEntries(profile).filter(
    (entry) => entry.source === 'course'
  );
  assert.equal(courses.length, CULTIVATION_ARTS.length);
  for (const art of CULTIVATION_ARTS) {
    const entry = courses.find((item) => item.sourceId === art.id);
    assert.equal(entry.id, `course:${art.id}`);
    assert.equal(entry.label, art.name);
    assert.equal(CARDS[entry.cardId].source, 'course');
  }
  for (const [id, cardId] of Object.entries({
    'art-basic-breath': 'course-code',
    'art-iron-skin': 'course-early',
    'art-spirit-cloud': 'course-math',
    'art-fiery-fist': 'course-algorithms',
    'art-water-mirror': 'course-linear',
    'art-earth-shield': 'course-physics',
  }))
    assert.equal(courses.find((entry) => entry.sourceId === id).cardId, cardId);
});

test('导入只依据已学课程列表，不把主修标识或学阶资格冒充已拥有', () => {
  const result = parseProfileSave(exportRaw());
  assert.deepEqual(result.profile.courseIds, [
    'art-basic-breath',
    'art-spirit-cloud',
  ]);
  const courses = getAvailableEntries(result.profile).filter(
    (entry) => entry.source === 'course'
  );
  assert.equal(courses.length, 2);
  assert.ok(!courses.some((entry) => entry.sourceId === 'art-water-mirror'));
  const higherOwned = parseProfileSave(
    exportRaw(
      exportedPlayer({
        realm: RealmType.QiRefining,
        cultivationArts: ['art-universe-devour'],
      })
    )
  );
  assert.deepEqual(higherOwned.profile.courseIds, ['art-universe-devour']);
});

test('装备以名称类型可装备性和数量白名单筛选，并保留真实库存实例ID', () => {
  const inventory = [
    ...exportedPlayer().inventory,
    {
      id: 'wrong-type',
      name: '降噪耳塞',
      type: ItemType.Herb,
      isEquippable: true,
      quantity: 1,
    },
    {
      id: 'not-equippable',
      name: '运动护腕',
      type: ItemType.Artifact,
      isEquippable: false,
      quantity: 1,
    },
    {
      id: 'zero',
      name: '军训迷彩服',
      type: ItemType.Armor,
      isEquippable: true,
      quantity: 0,
    },
    {
      id: 'unknown',
      name: '尚未支持的鼠标',
      type: ItemType.Weapon,
      isEquippable: true,
      quantity: 1,
    },
  ];
  const { profile, warnings } = parseProfileSave(
    exportRaw(exportedPlayer({ inventory }))
  );
  assert.deepEqual(
    profile.equipment.map((item) => item.id),
    ['owned-keyboard', 'owned-uniform', 'owned-earplugs', 'owned-wrist']
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /4 件物品/);
  const gear = getAvailableEntries(profile).filter(
    (entry) => entry.source === 'equipment'
  );
  assert.deepEqual(
    gear.map((entry) => entry.id),
    profile.equipment.map((item) => `equipment:${item.id}`)
  );
  assert.deepEqual(
    gear.map((entry) => entry.cardId),
    ['gear-keyboard', 'gear-uniform', 'gear-earplugs', 'gear-wrist']
  );
  assert.ok(!gear.some((entry) => entry.sourceId.startsWith('lottery-')));
});

test('主游戏属性按导出值冻结，不因课程装备稀有度或主力标识再次增加', () => {
  const player = exportedPlayer({ natalArtifactId: 'owned-earplugs' });
  const { profile } = parseProfileSave(exportRaw(player));
  for (const key of [
    'attack',
    'defense',
    'spirit',
    'physique',
    'speed',
    'maxHp',
  ])
    assert.equal(profile[key], player[key]);
  assert.deepEqual(
    Object.keys(profile).sort(),
    [
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
    ].sort()
  );
  const encoded = JSON.stringify(profile);
  for (const ignored of [
    '无关历史记录',
    'apiKey',
    'interactive',
    'equippedItems',
    'natalArtifactId',
    'effect',
  ])
    assert.ok(!encoded.includes(ignored));
});

test('未知课程与普通物品给出可见警告，不污染可用牌库', () => {
  const { profile, warnings } = parseProfileSave(
    exportRaw(
      exportedPlayer({
        cultivationArts: ['art-basic-breath', 'unknown-art', 42],
        inventory: [
          null,
          { id: 'food', name: '鲜牛奶', type: ItemType.Herb, quantity: 1 },
        ],
      })
    )
  );
  assert.deepEqual(profile.courseIds, ['art-basic-breath']);
  assert.deepEqual(profile.equipment, []);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /2 门/);
  assert.match(warnings[1], /2 件/);
  assert.equal(getAvailableEntries(profile).length, 9);
});

test('导入拒绝错误版本、角色或来源清单结构及非法数值', () => {
  for (const raw of [
    '{broken',
    '{}',
    exportRaw(undefined, { version: 1 }),
    JSON.stringify({ version: 2, player: [] }),
  ])
    assert.throws(() => parseProfileSave(raw));
  for (const patch of [
    { name: '' },
    { name: '人'.repeat(41) },
    { name: '含\n换行' },
    { realm: '未知' },
    { realmLevel: 0 },
    { realmLevel: 10 },
    { realmLevel: 1.5 },
    { attack: -1 },
    { defense: '5' },
    { spirit: null },
    { physique: 1e13 },
    { maxHp: 0 },
    { cultivationArts: {} },
    { inventory: 'not-an-array' },
  ])
    assert.throws(
      () => parseProfileSave(exportRaw(exportedPlayer(patch))),
      JSON.stringify(patch)
    );
  assert.throws(
    () => parseProfileSave(' '.repeat(2 * 1024 * 1024 + 1)),
    /2 MB/
  );
});

test('重复课程或库存ID明确拒绝，不静默合并用户条目', () => {
  assert.throws(
    () =>
      parseProfileSave(
        exportRaw(
          exportedPlayer({
            cultivationArts: ['art-basic-breath', 'art-basic-breath'],
          })
        )
      ),
    /重复/
  );
  const repeated = exportedPlayer().inventory.map((item) => ({ ...item }));
  repeated[1].id = repeated[0].id;
  assert.throws(
    () => parseProfileSave(exportRaw(exportedPlayer({ inventory: repeated }))),
    /编号重复/
  );
  const profile = createDemoProfile();
  profile.equipment[1].id = profile.equipment[0].id;
  assert.throws(() => assertTrialProfile(profile), /重复/);
});

test('牌库加入来源与简历选用相互独立，基础牌可留库而不出现在简历', () => {
  const loadout = createDefaultLoadout();
  const course = getAvailableEntries(loadout.profile).find(
    (entry) => entry.source === 'course'
  );
  loadout.library.push(course.id);
  assert.equal(getLibraryEntries(loadout).length, 9);
  assert.ok(!loadout.resume.includes(course.id));
  loadout.resume[0] = course.id;
  assertLoadout(loadout);
  assert.equal(getLoadoutReason(loadout), null);
  assert.ok(loadout.library.includes('base:0'));
  assert.ok(!loadout.resume.includes('base:0'));
});

test('简历草稿可少于八张保存，但开战必须8至16张且包含进攻', () => {
  const loadout = createDefaultLoadout();
  loadout.resume = [];
  assertLoadout(loadout);
  assert.match(getLoadoutReason(loadout), /至少选择 8/);
  assert.throws(() => createTrialBuild(loadout), /至少选择 8/);
  const expanded = allSourcesLoadout();
  expanded.resume = getAvailableEntries(expanded.profile)
    .filter((entry) => CARDS[entry.cardId].kind !== 'attack')
    .slice(0, 8)
    .map((entry) => entry.id);
  assertLoadout(expanded);
  assert.match(getLoadoutReason(expanded), /进攻牌/);
  expanded.resume = expanded.library.slice(0, 16);
  assert.equal(getLoadoutReason(expanded), null);
  expanded.resume = expanded.library.slice(0, 17);
  assert.match(getLoadoutReason(expanded), /至多选择 16/);
});

test('牌库与简历拒绝缺基础实例、重复、未拥有来源及尚未入库的牌', () => {
  const invalid = [
    (draft) => draft.library.pop(),
    (draft) => draft.library.push(draft.library[0]),
    (draft) => draft.resume.push(draft.resume[0]),
    (draft) => draft.library.push('course:unknown'),
    (draft) => draft.resume.push('course:art-basic-breath'),
    (draft) => {
      draft.version = 2;
    },
  ];
  for (const mutate of invalid) {
    const draft = createDefaultLoadout();
    mutate(draft);
    assert.throws(() => assertLoadout(draft));
  }
});

test('开战构建深拷贝角色、来源条目与简历，不再跟随配置草稿变化', () => {
  const loadout = allSourcesLoadout();
  loadout.resume = loadout.library.slice(0, 12);
  const before = structuredClone(loadout);
  const build = createTrialBuild(loadout);
  assertTrialBuild(build);
  assert.deepEqual(loadout, before);
  assert.notEqual(build.profile, loadout.profile);
  assert.notEqual(build.profile.courseIds, loadout.profile.courseIds);
  loadout.profile.name = '后改姓名';
  loadout.profile.courseIds.pop();
  loadout.profile.equipment[0].name = '后改装备';
  loadout.resume.pop();
  loadout.library.pop();
  assert.equal(build.profile.name, before.profile.name);
  assert.deepEqual(build.profile.courseIds, before.profile.courseIds);
  assert.deepEqual(build.profile.equipment, before.profile.equipment);
  assert.deepEqual(build.resume, before.resume);
  assertTrialBuild(build);
});

test('冻结快照重推真实来源，拒绝伪造牌效名称ID及额外原档字段', () => {
  const build = createTrialBuild(allSourcesLoadout());
  for (const mutate of [
    (snapshot) => {
      snapshot.library[0].label = '伪造名称';
    },
    (snapshot) => {
      snapshot.library[0].cardId = 'precise';
    },
    (snapshot) => {
      snapshot.library[0].sourceId = 'forged';
    },
    (snapshot) => {
      snapshot.library[0].source = 'equipment';
    },
    (snapshot) => {
      snapshot.profile.logs = [];
    },
    (snapshot) => {
      snapshot.library[0].rawItem = {};
    },
    (snapshot) => {
      snapshot.resume = [];
    },
  ]) {
    const changed = structuredClone(build);
    mutate(changed);
    assert.throws(() => assertTrialBuild(changed));
  }
});

test('角色快照与来源枚举是纯计算，JSON往返后语义一致', () => {
  const profile = createDemoProfile(RealmType.NascentSoul, 4);
  const before = structuredClone(profile);
  const first = getAvailableEntries(profile);
  first[0].label = '局部改动';
  assert.deepEqual(profile, before);
  assert.notEqual(getAvailableEntries(profile)[0].label, '局部改动');
  const loadout = allSourcesLoadout();
  const build = createTrialBuild(loadout);
  const restored = JSON.parse(JSON.stringify(build));
  assertTrialBuild(restored);
  assert.deepEqual(restored, build);
  const bad = structuredClone(profile);
  bad.courseIds.push('unknown');
  assert.throws(() => assertTrialProfile(bad));
  const unsupported = structuredClone(profile);
  unsupported.equipment.push({ id: 'unknown', name: '未支持装备' });
  assert.throws(() => assertTrialProfile(unsupported));
});

test('独立牌库仅访问专属键，缺失和损坏读取均不自动写入', () => {
  const empty = store();
  const initial = loadLoadout(empty);
  assert.deepEqual(initial.loadout, createDefaultLoadout());
  assert.equal(initial.error, '');
  assert.deepEqual(empty.reads, [LOADOUT_SAVE_KEY]);
  assert.equal(empty.writes.length, 0);
  const corrupt = store('{broken');
  const loaded = loadLoadout(corrupt);
  assert.match(loaded.error, /已保留/);
  assert.equal(corrupt.data.get(LOADOUT_SAVE_KEY), '{broken');
  assert.equal(corrupt.writes.length, 0);
  assert.equal(corrupt.data.get('npu-game-save'), 'main-game-sentinel');
});

test('显式保存可保存未满八张草稿，写失败保留旧配置且不写主游戏', () => {
  const db = store();
  const original = createDefaultLoadout();
  assert.equal(saveLoadout(db, original).ok, true);
  assert.deepEqual(loadLoadout(db).loadout, original);
  const oldRaw = db.data.get(LOADOUT_SAVE_KEY);
  const draft = structuredClone(original);
  draft.resume = [];
  db.fail(true);
  assert.equal(saveLoadout(db, draft).ok, false);
  assert.equal(db.data.get(LOADOUT_SAVE_KEY), oldRaw);
  db.fail(false);
  assert.equal(saveLoadout(db, draft).ok, true);
  assert.deepEqual(loadLoadout(db).loadout.resume, []);
  const invalid = structuredClone(original);
  invalid.profile.attack = Number.POSITIVE_INFINITY;
  const goodRaw = db.data.get(LOADOUT_SAVE_KEY);
  assert.equal(saveLoadout(db, invalid).ok, false);
  assert.equal(db.data.get(LOADOUT_SAVE_KEY), goodRaw);
  assert.ok(db.writes.every((key) => key === LOADOUT_SAVE_KEY));
  assert.equal(db.data.get('npu-game-save'), 'main-game-sentinel');
});

test('档案大小按UTF8字节限制，含中文的超大JSON也明确拒绝', () => {
  const raw = exportRaw(exportedPlayer(), { note: '字'.repeat(750000) });
  assert.ok(raw.length < 2 * 1024 * 1024);
  assert.ok(new TextEncoder().encode(raw).byteLength > 2 * 1024 * 1024);
  assert.throws(() => parseProfileSave(raw), /2 MB/);
});
