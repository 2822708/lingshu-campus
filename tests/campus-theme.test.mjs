import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getNpuTalent, LING_GENS } from '../npu-data';
import { neutralizeCampusText } from '../utils/campusText';
import { createInitialPlayer } from '../utils/playerUtils';
import { createGameSave, parseImportSave, restoreSavedPlayer } from '../features/save/saveCodec';
import LogPanel from '../components/LogPanel';
import EquipmentPanel from '../components/EquipmentPanel';
import { EquipmentSlot, ItemType } from '../types';
import baseline from './fixtures/campus-talents-baseline.json';

test('80种旧天赋ID继续解析，所有加成与改名前的提交一致', () => {
  assert.equal(baseline.combinations.length, 80);
  assert.equal(new Set(LING_GENS.map(g => g.college)).size, 8);
  assert.ok(LING_GENS.every(g => g.college.endsWith('学部')));
  for (const original of baseline.combinations) {
    const current = getNpuTalent(original.id);
    assert.equal(current.id, original.id);
    assert.deepEqual(current.effects, original.effects);
  }
});

test('旧日志、装备仅更换显示文字，导入导出和玩家姓名保持原始数据', () => {
  const player = createInitialPlayer('南邮是我的自定义名#ABCD', 'npu:circuit:juanwang');
  const item = {
    id: 'legacy-keyboard', name: '南邮机械键盘', description: '南京邮电大学旧纪念键盘',
    type: ItemType.Weapon, quantity: 2, isEquippable: true,
    equipmentSlot: EquipmentSlot.Weapon, effect: { attack: 7 },
  };
  player.inventory = [item];
  player.equippedItems = { [EquipmentSlot.Weapon]: item.id };
  const logs = [{ id: 'old-1', text: '欢迎来到南邮。NPU 历年期末真题在仙林。', type: 'special', timestamp: 1000 }];
  const saved = createGameSave(player, logs, 123);
  const snapshot = structuredClone(saved);
  const imported = parseImportSave(JSON.stringify(saved));
  const restored = restoreSavedPlayer(imported.player, imported.player.name);
  const journalHtml = renderToStaticMarkup(React.createElement(LogPanel, { logs: imported.logs }));
  const equipmentHtml = renderToStaticMarkup(React.createElement(EquipmentPanel, {
    player: restored, inventory: restored.inventory, equippedItems: restored.equippedItems,
    onUnequip() {},
  }));
  assert.doesNotMatch(journalHtml + equipmentHtml, /南邮|南京邮电|NPU|仙林/);
  assert.match(journalHtml, /学园.*东区/);
  assert.match(equipmentHtml, /学园机械键盘/);
  assert.equal(restored.name, player.name);
  assert.deepEqual(restored.inventory, player.inventory);
  assert.deepEqual(saved, snapshot);
  assert.deepEqual(createGameSave(restored, imported.logs, 123), snapshot);
});

test('兼容替换覆盖旧院系校训，同时保留正常芯片技术词', () => {
  assert.equal(neutralizeCampusText('通信与信息工程学院，信达天下，自强不息'), '信号学部，一页日常，一点成长');
  assert.equal(neutralizeCampusText('NPU 推理芯片、GPU、PCB、傅里叶变换'), 'NPU 推理芯片、GPU、PCB、傅里叶变换');
  assert.equal(neutralizeCampusText('普通校园文字'), '普通校园文字');
  assert.equal(neutralizeCampusText(undefined), '');
  assert.equal(neutralizeCampusText(null), '');
});

test('生产文案不重新引入原校名、校训或专有院系地标', () => {
  const root = process.cwd();
  const files = ['constants.ts', 'npu-data.ts', 'index.html', 'metadata.json'];
  function walk(folder) {
    for (const entry of readdirSync(join(root, folder), { withFileTypes: true })) {
      const relative = join(folder, entry.name);
      if (entry.isDirectory()) walk(relative);
      else if (/\.(ts|tsx)$/.test(entry.name) && relative !== join('utils', 'campusText.ts')) files.push(relative);
    }
  }
  for (const folder of ['components', 'views', 'hooks', 'services', 'features', 'utils', 'config']) walk(folder);
  const forbidden = /南邮|南京邮电|NJUPT|NUPT|三牌楼|仙林|信达天下|自强不息|厚德.*弘毅.*求是.*笃行|电子与光学工程学院|通信与信息工程学院|柔性电子（未来技术）学院/;
  for (const file of files) assert.doesNotMatch(readFileSync(join(root, file), 'utf8'), forbidden, file);
});
