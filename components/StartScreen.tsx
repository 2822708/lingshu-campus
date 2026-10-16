import React, { useState, useMemo } from 'react';
import { ArrowLeft, ArrowRight, Check, RotateCcw } from 'lucide-react';
import {
  LING_GENS,
  LingGen,
  MingGe,
  rollMingGe,
  mergeNpuTalent,
} from '../npu-data';
import { Talent } from '../types';

interface Props {
  onStart: (playerName: string, npuTalentId: string) => void;
}
type Step = 'linggen' | 'mingge' | 'name';
const STEPS: Array<{ id: Step; name: string; note: string }> = [
  { id: 'linggen', name: '选择学院', note: '选择专业方向' },
  { id: 'mingge', name: '抽取命格', note: '确定初始天赋' },
  { id: 'name', name: '登记姓名', note: '确认入学信息' },
];
const EFFECT_NAMES: Record<keyof Talent['effects'], string> = {
  attack: '攻击',
  defense: '防御',
  hp: '精力',
  spirit: '思维',
  physique: '体能',
  speed: '手速',
  expRate: '绩点获取',
  luck: '欧气',
};

const StartScreen: React.FC<Props> = ({ onStart }) => {
  const [step, setStep] = useState<Step>('linggen');
  const [selectedLingGenId, setSelectedLingGenId] = useState<string | null>(
    null
  );
  const [rolledMingGe, setRolledMingGe] = useState<MingGe | null>(null);
  const [rerollUsed, setRerollUsed] = useState(false);
  const [playerName, setPlayerName] = useState('');
  // 保持首次抽取和仅一次重抽的原有规则。
  const initialMingGe = useMemo(() => rollMingGe(), []);
  const finalMingGe = rolledMingGe || initialMingGe;
  const selectedLingGen = selectedLingGenId
    ? LING_GENS.find((g) => g.id === selectedLingGenId)
    : null;
  const handleRollAgain = () => {
    if (rerollUsed) return;
    setRolledMingGe(rollMingGe());
    setRerollUsed(true);
  };
  const handleStart = () => {
    if (!playerName.trim() || !selectedLingGenId || !finalMingGe) return;
    onStart(
      playerName.trim(),
      'npu:' + selectedLingGenId + ':' + finalMingGe.id
    );
  };
  const canGoNext = {
    linggen: !!selectedLingGenId,
    mingge: true,
    name: !!playerName.trim(),
  };
  const goNext = () => {
    if (step === 'linggen') setStep('mingge');
    else if (step === 'mingge') setStep('name');
    else handleStart();
  };
  const goPrev = () => {
    if (step === 'mingge') setStep('linggen');
    else if (step === 'name') setStep('mingge');
  };
  const previewTalent =
    selectedLingGen && finalMingGe
      ? mergeNpuTalent(selectedLingGen.id, finalMingGe.id)
      : null;
  const stepIndex = STEPS.findIndex((entry) => entry.id === step);

  return (
    <div className="paper-entry-page">
      <div className="paper-entry-wrap paper-entry-register-wrap">
        <header className="paper-entry-masthead">
          <span>灵枢录 · 南邮修仙传</span>
          <span>新生档案</span>
        </header>
        <main className="paper-entry-sheet paper-entry-register">
          <aside className="paper-entry-register-sidebar">
            <p className="paper-entry-eyebrow">成长档案 · 初次登记</p>
            <h1>入学登记</h1>
            <p className="paper-entry-register-intro">
              完成以下三项，
              <br />
              建立你的校园档案。
            </p>
            <ol className="paper-entry-steps" aria-label="登记步骤">
              {STEPS.map((entry, index) => (
                <li
                  key={entry.id}
                  className={
                    index === stepIndex
                      ? 'is-current'
                      : index < stepIndex
                        ? 'is-done'
                        : ''
                  }
                  aria-current={entry.id === step ? 'step' : undefined}
                >
                  <span className="paper-entry-step-number">
                    {index < stepIndex ? (
                      <Check size={16} />
                    ) : (
                      '0' + (index + 1)
                    )}
                  </span>
                  <span>
                    <strong>{entry.name}</strong>
                    <small>{entry.note}</small>
                  </span>
                </li>
              ))}
            </ol>
            <p className="paper-entry-register-footnote">
              所有选择将记入你的成长档案。
            </p>
          </aside>
          <div className="paper-entry-register-body">
            <div className="paper-entry-form-heading">
              <div>
                <span>第 {stepIndex + 1} 项 / 共 3 项</span>
                <h2>{STEPS[stepIndex].name}</h2>
              </div>
              <span className="paper-entry-form-label">入学登记表</span>
            </div>
            <div className="paper-entry-form-content" key={step}>
              {step === 'linggen' && (
                <section aria-label="学院选择">
                  <p className="paper-entry-form-description">
                    选择一个学院。不同专业具有不同的初始属性，游戏开始后不能更换。
                  </p>
                  <div
                    className="paper-entry-college-grid"
                    role="group"
                    aria-label="选择你的学院"
                  >
                    {LING_GENS.map((gen, index) => (
                      <CollegeChoice
                        key={gen.id}
                        gen={gen}
                        number={index + 1}
                        selected={selectedLingGenId === gen.id}
                        onClick={() => setSelectedLingGenId(gen.id)}
                      />
                    ))}
                  </div>
                </section>
              )}
              {step === 'mingge' && (
                <section className="paper-entry-fate" aria-label="抽取的命格">
                  <p className="paper-entry-form-description">
                    命格已随机抽取。如需更换，可以重新抽取一次。
                  </p>
                  {selectedLingGen && (
                    <p className="paper-entry-selection-note">
                      已选学院：{selectedLingGen.college}
                    </p>
                  )}
                  <div className="paper-entry-fate-record">
                    <span className="paper-entry-eyebrow">你的命格</span>
                    <h3>{finalMingGe.name}</h3>
                    <p>{finalMingGe.description}</p>
                    <blockquote>{finalMingGe.flavor}</blockquote>
                    <EffectsList effects={finalMingGe.effects} />
                  </div>
                  <div className="paper-entry-reroll">
                    <button
                      className="paper-entry-button paper-entry-button-secondary"
                      onClick={handleRollAgain}
                      disabled={rerollUsed}
                    >
                      <RotateCcw size={16} />
                      {rerollUsed ? '已使用重抽机会' : '重新抽取'}
                    </button>
                    <span>
                      {rerollUsed ? '本次命格已确定。' : '剩余 1 次机会'}
                    </span>
                  </div>
                </section>
              )}
              {step === 'name' && (
                <section
                  className="paper-entry-name-form"
                  aria-label="姓名登记"
                >
                  <p className="paper-entry-form-description">
                    确认学院与命格，填写你的校园称呼。
                  </p>
                  <dl className="paper-entry-registration-summary">
                    <div>
                      <dt>学院</dt>
                      <dd>{selectedLingGen?.college || '未选择'}</dd>
                    </div>
                    <div>
                      <dt>专业</dt>
                      <dd>{selectedLingGen?.name || '未选择'}</dd>
                    </div>
                    <div>
                      <dt>命格</dt>
                      <dd>{finalMingGe.name}</dd>
                    </div>
                  </dl>
                  <label
                    className="paper-entry-name-label"
                    htmlFor="student-name"
                  >
                    姓名
                  </label>
                  <input
                    id="student-name"
                    className="paper-entry-name-input"
                    value={playerName}
                    onChange={(event) => setPlayerName(event.target.value)}
                    placeholder="请输入你的名字"
                    maxLength={20}
                    autoFocus
                  />
                  <p className="paper-entry-input-hint">最多 20 个字符</p>
                  {previewTalent && (
                    <div className="paper-entry-talent-summary">
                      <h3>初始天赋</h3>
                      <p>
                        {selectedLingGen?.name} · {finalMingGe.name}
                      </p>
                      <EffectsList effects={previewTalent.effects} />
                    </div>
                  )}
                </section>
              )}
            </div>
            <nav className="paper-entry-form-navigation" aria-label="登记操作">
              <button
                className="paper-entry-button paper-entry-button-secondary"
                onClick={goPrev}
                disabled={step === 'linggen'}
              >
                <ArrowLeft size={16} /> 上一步
              </button>
              <button
                className="paper-entry-button paper-entry-button-primary"
                onClick={goNext}
                disabled={!canGoNext[step]}
              >
                {step === 'name' ? '开启校园生活' : '下一步'}{' '}
                <ArrowRight size={16} />
              </button>
            </nav>
          </div>
        </main>
        <footer className="paper-entry-footer">
          <span>灵枢录 · 南邮修仙传</span>
          <span>信达天下，自强不息</span>
        </footer>
      </div>
    </div>
  );
};

const CollegeChoice: React.FC<{
  gen: LingGen;
  number: number;
  selected: boolean;
  onClick: () => void;
}> = ({ gen, number, selected, onClick }) => (
  <button
    className={'paper-entry-college-choice' + (selected ? ' is-selected' : '')}
    onClick={onClick}
    aria-pressed={selected}
  >
    <div className="paper-entry-college-title">
      <span className="paper-entry-choice-number">{'0' + number}</span>
      <h3>{gen.college}</h3>
      <span className="paper-entry-choice-check" aria-hidden="true">
        {selected && <Check size={13} />}
      </span>
    </div>
    <p className="paper-entry-college-specialty">
      {gen.name} · {gen.slogan}
    </p>
    <p className="paper-entry-college-description">{gen.description}</p>
    <EffectsList effects={gen.effects} />
  </button>
);

const EffectsList: React.FC<{ effects: Talent['effects'] }> = ({ effects }) => {
  const entries = (
    Object.keys(effects) as Array<keyof Talent['effects']>
  ).flatMap((key) => {
    const value = effects[key];
    return typeof value === 'number' && value !== 0 ? [{ key, value }] : [];
  });
  if (entries.length === 0)
    return <p className="paper-entry-no-effects">无额外属性变化</p>;
  return (
    <ul className="paper-entry-effects" aria-label="属性变化">
      {entries.map(({ key, value }) => (
        <li key={key}>
          <span>{EFFECT_NAMES[key]}</span>
          <strong>
            {value > 0 ? '+' : ''}
            {Math.abs(value) < 1 ? Math.round(value * 100) + '%' : value}
          </strong>
        </li>
      ))}
    </ul>
  );
};

export default StartScreen;
