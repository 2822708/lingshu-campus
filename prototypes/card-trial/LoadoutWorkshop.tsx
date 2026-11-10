import { useEffect, useState } from 'react';
import { REALM_ORDER } from '../../constants';
import type { RealmType } from '../../types';
import { CARDS } from './catalog';
import {
  createDefaultLoadout,
  createDemoProfile,
  createTrialBuild,
  getAvailableEntries,
  getLibraryEntries,
  getLoadoutReason,
  MAX_RESUME_CARDS,
  MIN_RESUME_CARDS,
  parseProfileSave,
  saveLoadout,
} from './loadout';
import { getCardScaling, getTrialMaxHp } from './progression';
import type { TrialStorage } from './persistence';
import type {
  TrialBuild,
  TrialLibraryEntry,
  TrialLoadout,
  TrialProfile,
} from './types';

export const ATTRIBUTE_LABELS = {
  attack: '攻击',
  defense: '防御',
  spirit: '思维',
  physique: '体能',
  speed: '手速',
} as const;

interface WorkshopProps {
  initial: TrialLoadout;
  initialError?: string;
  storage: TrialStorage;
  hasRun: boolean;
  onClose: () => void;
  onSaved: (loadout: TrialLoadout) => void;
  onUse: (build: TrialBuild, loadout: TrialLoadout) => void;
}

function withProfile(profile: TrialProfile): TrialLoadout {
  const base = createDefaultLoadout();
  return { ...base, profile };
}

function EntryInfo({
  entry,
  profile,
}: {
  entry: TrialLibraryEntry;
  profile: TrialProfile;
}) {
  const card = CARDS[entry.cardId];
  const scaling = getCardScaling(card, profile);
  return (
    <span className="ct-library-info">
      <strong>{entry.label}</strong>
      <small>
        {card.cost} 专注 ·{' '}
        {entry.source === 'basic'
          ? '基础'
          : entry.source === 'course'
            ? '选课'
            : '装备'}{' '}
        · {{ attack: '进攻', defense: '防御', utility: '准备' }[card.kind]}
      </small>
      <span>{card.description}</span>
      {card.scaling && (
        <em>
          {ATTRIBUTE_LABELS[card.scaling.stat]}加成 +{scaling.bonus}（上限 +
          {card.scaling.cap}）
        </em>
      )}
    </span>
  );
}

/** 只编辑独立配置；采用此简历时才建立冻结的本次试炼快照。 */
export function LoadoutWorkshop({
  initial,
  initialError = '',
  storage,
  hasRun,
  onClose,
  onSaved,
  onUse,
}: WorkshopProps) {
  const [draft, setDraft] = useState<TrialLoadout>(() =>
    structuredClone(initial)
  );
  const [tab, setTab] = useState<'library' | 'resume'>('library');
  const [notice, setNotice] = useState(initialError);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  useEffect(() => {
    document
      .getElementById('ct-workshop-title')
      ?.focus({ preventScroll: true });
  }, []);
  const available = getAvailableEntries(draft.profile);
  const library = getLibraryEntries(draft);
  const reason = getLoadoutReason(draft);
  const counts = draft.resume.reduce(
    (result, id) => {
      const entry = library.find((item) => item.id === id);
      if (entry) result[CARDS[entry.cardId].kind]++;
      return result;
    },
    { attack: 0, defense: 0, utility: 0 }
  );

  function changeProfile(profile: TrialProfile) {
    setDraft(withProfile(profile));
    setError('');
    setNotice(
      '角色来源已更新；请重新挑选课程、装备与简历。当前试炼继续使用原快照。'
    );
  }
  async function importFile(file?: File) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError('档案文件请小于 2 MB。');
      return;
    }
    setReading(true);
    try {
      const imported = parseProfileSave(await file.text());
      changeProfile(imported.profile);
      setNotice(
        `已读取 ${imported.profile.name} 的角色快照。${imported.warnings.join(' ')}`
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : '档案读取失败，原简历已保留。'
      );
    } finally {
      setReading(false);
    }
  }
  function toggleLibrary(id: string, checked: boolean) {
    setError('');
    setNotice('配置已调整，保存后可用于下一次开局。');
    setDraft((previous) => ({
      ...previous,
      library: checked
        ? [...previous.library, id]
        : previous.library.filter((value) => value !== id),
      resume: checked
        ? previous.resume
        : previous.resume.filter((value) => value !== id),
    }));
  }
  function toggleResume(id: string, checked: boolean) {
    if (checked && draft.resume.length >= MAX_RESUME_CARDS) return;
    setError('');
    setNotice('配置已调整，保存后可用于下一次开局。');
    setDraft((previous) => ({
      ...previous,
      resume: checked
        ? [...previous.resume, id]
        : previous.resume.filter((value) => value !== id),
    }));
  }
  function persist(use = false) {
    let build: TrialBuild | undefined;
    try {
      if (use) build = createTrialBuild(draft);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '请检查简历。');
      return;
    }
    const result = saveLoadout(storage, draft);
    if (!result.ok) {
      setError(result.error ?? '简历尚未保存，请重试。');
      return;
    }
    const snapshot = structuredClone(draft);
    onSaved(snapshot);
    setError('');
    setNotice('简历配置已保存。当前对局的角色和牌组保持其开局快照。');
    if (build) onUse(build, snapshot);
  }
  return (
    <section
      className="ct-workshop ct-overlay"
      role="dialog"
      aria-label="简历与牌库"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !reading) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <header className="ct-workshop-heading">
        <div>
          <p className="ct-section-label">课后准备</p>
          <h2 id="ct-workshop-title" tabIndex={-1}>
            牌库 → 简历
          </h2>
        </div>
        <button
          type="button"
          className="ct-text-button"
          onClick={onClose}
          disabled={reading}
        >
          返回牌桌
        </button>
      </header>
      <div className="ct-workshop-body">
        <details className="ct-profile-source">
          <summary>
            {draft.profile.name} · {draft.profile.realm}{' '}
            {draft.profile.realmLevel} 层 ·{' '}
            {draft.profile.source === 'import' ? '导入档案' : '示例角色'}
            （更换）
          </summary>
          <p>
            在主游戏设置中导出存档，再选择文件。这里只提取角色属性、已学课程和支持的装备，不改变主游戏进度。
          </p>
          <label className="ct-import-label">
            导入角色档案（JSON）
            <input
              type="file"
              accept=".json,application/json"
              disabled={reading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                void importFile(file);
              }}
            />
          </label>
          <div className="ct-demo-options">
            <label>
              示例学阶
              <select
                value={draft.profile.realm}
                disabled={reading}
                onChange={(event) =>
                  changeProfile(
                    createDemoProfile(
                      event.target.value as RealmType,
                      draft.profile.realmLevel
                    )
                  )
                }
              >
                {REALM_ORDER.map((realm) => (
                  <option key={realm} value={realm}>
                    {realm}
                  </option>
                ))}
              </select>
            </label>
            <label>
              示例层级
              <select
                value={draft.profile.realmLevel}
                disabled={reading}
                onChange={(event) =>
                  changeProfile(
                    createDemoProfile(
                      draft.profile.realm,
                      Number(event.target.value)
                    )
                  )
                }
              >
                {Array.from({ length: 9 }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {index + 1} 层
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="ct-text-button"
              disabled={reading}
              onClick={() =>
                changeProfile(
                  createDemoProfile(
                    draft.profile.realm,
                    draft.profile.realmLevel
                  )
                )
              }
            >
              使用同阶示例角色
            </button>
          </div>
        </details>
        <p className="ct-profile-values">
          攻击 {draft.profile.attack} · 防御 {draft.profile.defense} · 思维{' '}
          {draft.profile.spirit} · 体能 {draft.profile.physique} · 手速{' '}
          {draft.profile.speed} · 试炼精力 {getTrialMaxHp(draft.profile)}
        </p>
        {notice && (
          <p className="ct-workshop-notice" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="ct-workshop-error" role="alert">
            {error}
          </p>
        )}
        <div className="ct-workshop-tabs" aria-label="构筑步骤">
          <button
            type="button"
            aria-pressed={tab === 'library'}
            onClick={() => setTab('library')}
          >
            1 · 选课 / 装备入库（{library.length} 张）
          </button>
          <button
            type="button"
            aria-pressed={tab === 'resume'}
            onClick={() => setTab('resume')}
          >
            2 · 挑选简历（{draft.resume.length} / {MAX_RESUME_CARDS}）
          </button>
        </div>
        <p className="ct-workshop-help">
          {tab === 'library'
            ? '基础 8 张已在牌库。勾选已拥有的课程和支持装备加入牌库，再挑选出发简历。'
            : `从牌库选 ${MIN_RESUME_CARDS}–${MAX_RESUME_CARDS} 张，至少一张进攻牌；选牌顺序就是简历顺序，开局会洗牌。战后奖励可再加入本次简历。`}
        </p>
        <div
          className="ct-library-grid"
          role="group"
          aria-label={tab === 'library' ? '可加入牌库的来源' : '简历牌组选择'}
        >
          {(tab === 'library'
            ? available.filter((entry) => entry.source !== 'basic')
            : library
          ).map((entry, index) => {
            const checked =
              tab === 'library'
                ? draft.library.includes(entry.id)
                : draft.resume.includes(entry.id);
            return (
              <label
                className={`ct-library-choice${checked ? ' is-selected' : ''}`}
                key={entry.id}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={
                    reading ||
                    (tab === 'resume' &&
                      !checked &&
                      draft.resume.length >= MAX_RESUME_CARDS)
                  }
                  aria-label={`${tab === 'library' ? '加入牌库' : '编入简历'}：${entry.label}（${index + 1}）`}
                  onChange={(event) =>
                    tab === 'library'
                      ? toggleLibrary(entry.id, event.target.checked)
                      : toggleResume(entry.id, event.target.checked)
                  }
                />
                <EntryInfo entry={entry} profile={draft.profile} />
              </label>
            );
          })}
        </div>
        {tab === 'library' &&
          !available.some((entry) => entry.source !== 'basic') && (
            <p>这份档案暂时没有可转化的课程或装备，仍可使用基础简历。</p>
          )}
        <details className="ct-power-note">
          <summary>属性如何影响牌与对手</summary>
          <p>
            有属性标记的牌，按“角色属性 ÷ 同学阶同层级基准 ×
            系数”取整并限制加成上限；基础牌保持固定效果。已有课程、装备属性不重复累加。对手采用主游戏同学阶与层级的基准，再按弱敌、普通、强敌折算到卡牌单位，不随你的装备同步膨胀。
          </p>
        </details>
      </div>
      <footer className="ct-workshop-footer">
        <div>
          <strong>简历 {draft.resume.length} 张</strong>
          <span>
            进攻 {counts.attack} · 防御 {counts.defense} · 准备 {counts.utility}
          </span>
          <small>{reason ?? '可以出发；角色属性与简历会在开局时冻结。'}</small>
        </div>
        <button
          type="button"
          className="ct-text-button"
          disabled={reading}
          onClick={() => persist()}
        >
          保存配置
        </button>
        <button
          type="button"
          className="ct-primary"
          disabled={reading || Boolean(reason)}
          onClick={() => persist(true)}
        >
          {hasRun ? '用此简历新开…' : '以此简历出发'}
        </button>
      </footer>
    </section>
  );
}
