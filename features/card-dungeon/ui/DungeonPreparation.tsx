import { useEffect, useId, useMemo, useState } from 'react';
import type { PlayerStats } from '../../../types';
import { CARDS } from '../../card-battle/catalog';
import {
  createDefaultCardLoadout,
  MAX_DUNGEON_CARDS,
  MIN_DUNGEON_CARDS,
  repairDungeonLoadout,
  validateDungeonLoadout,
} from '../loadout';
import type { CardLoadout } from '../loadout';
import { BASIC_DUNGEON_CARD_IDS, getDungeonCardSources } from '../sources';
import type { DungeonCardSource } from '../sources';
import { getDungeonEquipmentTraits } from '../equipment';
import './preparation.css';

export interface DungeonPreparationProps {
  player: PlayerStats;
  loadout?: CardLoadout;
  onSave: (next: CardLoadout, expectedRevision: number) => boolean;
  onBack: () => void;
}
/** A local draft; only the main save writer can accept a new revision. */
export function DungeonPreparation({
  player,
  loadout,
  onSave,
  onBack,
}: DungeonPreparationProps) {
  const [draft, setDraft] = useState(
    () => loadout ?? createDefaultCardLoadout()
  );
  const [tab, setTab] = useState<'sources' | 'library' | 'resume'>('resume');
  const [feedback, setFeedback] = useState('');
  const headingId = useId();
  const sources = useMemo(() => getDungeonCardSources(player), [player]);
  const equipmentTraits = useMemo(
    () => getDungeonEquipmentTraits(player),
    [player]
  );
  const byId = new Map<string, DungeonCardSource>(
    sources.map((source) => [source.id, source])
  );
  const validation = validateDungeonLoadout(player, draft);
  const expectedRevision = loadout?.revision ?? 0;
  useEffect(() => {
    setDraft(loadout ?? createDefaultCardLoadout());
  }, [loadout]);
  const shownIds =
    tab === 'sources'
      ? sources.map((source) => source.id)
      : tab === 'library'
        ? draft.library
        : draft.resume;
  const missing = draft.library.filter((id) => !byId.has(id));
  function changeLibrary(id: string) {
    setFeedback('');
    setDraft((old) =>
      old.library.includes(id)
        ? {
            ...old,
            library: old.library.filter((value) => value !== id),
            resume: old.resume.filter((value) => value !== id),
          }
        : { ...old, library: [...old.library, id] }
    );
  }
  function changeResume(id: string) {
    setFeedback('');
    setDraft((old) =>
      old.resume.includes(id)
        ? { ...old, resume: old.resume.filter((value) => value !== id) }
        : old.resume.length < MAX_DUNGEON_CARDS
          ? { ...old, resume: [...old.resume, id] }
          : old
    );
  }
  function save() {
    if (!validation.valid) return;
    if (onSave(draft, expectedRevision)) {
      setFeedback('简历已保存，可返回副本列表报名。');
    } else setFeedback('暂未保存，请查看保存提示后重试。');
  }
  return (
    <section className="cd-preparation" aria-labelledby={headingId}>
      <div className="cd-prep-title">
        <div>
          <p>出发前 · 整理成长档案</p>
          <h4 id={headingId}>我的作战简历</h4>
        </div>
        <button onClick={onBack}>返回副本列表</button>
      </div>
      <p className="cd-prep-intro">
        先将战术牌、已学课程、当前装备加入牌库，再从牌库选 {MIN_DUNGEON_CARDS}–
        {MAX_DUNGEON_CARDS}{' '}
        张组成简历。基础牌始终可用。入场后按当时的角色属性计算牌面数值。
      </p>
      {equipmentTraits.length > 0 ? (
        <details className="cd-prep-equipment">
          <summary>已穿戴特性 {equipmentTraits.length} · 入场自动生效</summary>
          <p>装备特性无需放入简历；对应装备卡可按打法另行选入。</p>
          <ul>
            {equipmentTraits.map((trait) => (
              <li key={trait.id}>
                <strong>{trait.name}</strong>：{trait.description}
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="cd-prep-equipment-empty">
          当前未穿戴带有卡牌副本特性的装备，可在背包查看装备说明。
        </p>
      )}
      <div className="cd-prep-tabs" role="tablist" aria-label="整理简历">
        <button
          role="tab"
          aria-selected={tab === 'sources'}
          onClick={() => setTab('sources')}
        >
          可用来源 {sources.length}
        </button>
        <button
          role="tab"
          aria-selected={tab === 'library'}
          onClick={() => setTab('library')}
        >
          牌库 {draft.library.length}
        </button>
        <button
          role="tab"
          aria-selected={tab === 'resume'}
          onClick={() => setTab('resume')}
        >
          简历 {draft.resume.length} / {MAX_DUNGEON_CARDS}
        </button>
      </div>
      <div
        className="cd-prep-list"
        role="tabpanel"
        aria-label={
          { sources: '可用来源', library: '牌库', resume: '简历' }[tab]
        }
      >
        {shownIds.length === 0 && <p>这里暂时没有卡牌。请先在牌库中选择。</p>}
        {shownIds.map((id) => {
          const source = byId.get(id);
          const template = source && CARDS[source.templateId];
          const inLibrary = draft.library.includes(id);
          const inResume = draft.resume.includes(id);
          const permanent = BASIC_DUNGEON_CARD_IDS.includes(id);
          return (
            <article
              key={id}
              className={`cd-source-row${!source ? ' is-missing' : ''}`}
            >
              <div>
                <strong>{source?.name ?? '来源已失效'}</strong>
                <small>
                  {source?.sourceLabel ?? id}
                  {template ? ` · ${template.cost} 专注` : ''}
                </small>
                <p>
                  {source?.description ??
                    '课程或装备已变化。请移除此项，或使用下方的整理按钮。'}
                </p>
                {template?.scaling && (
                  <em>
                    随角色
                    {
                      {
                        attack: '攻击',
                        defense: '防御',
                        spirit: '思维',
                        physique: '体能',
                        speed: '手速',
                      }[template.scaling.stat]
                    }
                    增加威力
                  </em>
                )}
              </div>
              <div className="cd-source-actions">
                {tab === 'sources' ? (
                  <button
                    disabled={permanent}
                    aria-pressed={inLibrary}
                    onClick={() => changeLibrary(id)}
                  >
                    {permanent
                      ? '基础常驻'
                      : inLibrary
                        ? '移出牌库'
                        : '加入牌库'}
                  </button>
                ) : (
                  <>
                    <button
                      aria-pressed={inResume}
                      disabled={
                        !source ||
                        (!inResume && draft.resume.length >= MAX_DUNGEON_CARDS)
                      }
                      onClick={() => changeResume(id)}
                    >
                      {inResume ? '移出简历' : '加入简历'}
                    </button>
                    {tab === 'library' && !permanent && (
                      <button onClick={() => changeLibrary(id)}>
                        移出牌库
                      </button>
                    )}
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <div className="cd-prep-status" role="status">
        {feedback ||
          (validation.valid
            ? `已选 ${draft.resume.length} 张，至少含一张进攻牌，可以保存。`
            : validation.errors.join(' '))}
      </div>
      <footer>
        <span>原有简历在保存成功后才替换。</span>
        <div>
          {missing.length > 0 && (
            <button
              onClick={() => {
                setDraft(repairDungeonLoadout(player, draft));
                setFeedback('已移除失效来源，并补齐基础牌；请确认后保存。');
              }}
            >
              整理失效来源
            </button>
          )}
          <button
            className="cd-prep-save"
            disabled={!validation.valid}
            onClick={save}
          >
            保存简历
          </button>
        </div>
      </footer>
    </section>
  );
}
export default DungeonPreparation;
