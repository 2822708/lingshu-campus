import { lazy, Suspense, useState } from 'react';
import { CAMPUS_THEME } from './config/campusTheme';
import './features/rogue-mode/rogue-mode.css';

const CampusApp = lazy(() => import('./App'));
const RogueMode = lazy(() => import('./features/rogue-mode/RogueMode'));

/** Only the selected mode is mounted, so campus timers and storage stay isolated. */
export default function GameEntry() {
  const [mode, setMode] = useState<'choose' | 'campus' | 'rogue'>('choose');
  if (mode !== 'choose')
    return (
      <Suspense fallback={<main className="rm-loading">正在翻开手记…</main>}>
        {mode === 'campus' ? (
          <CampusApp onChooseMode={() => setMode('choose')} />
        ) : (
          <RogueMode onExit={() => setMode('choose')} />
        )}
      </Suspense>
    );
  return (
    <main className="rm-mode-page">
      <div className="rm-mode-wrap">
        <p className="rm-eyebrow">{CAMPUS_THEME.title}</p>
        <h1>同一座学园，两种修行</h1>
        <p className="rm-muted">
          选课悟道，实验炼器。继续校园修行，或进入一场从零构筑的灵枢试炼。
        </p>
        <div className="rm-mode-choices">
          <button className="rm-mode-choice" onClick={() => setMode('campus')}>
            <span className="rm-mode-number">01</span>
            <strong>校园修行</strong>
            <span>课程悟道 · 实验炼器 · 日常机缘</span>
            <p>从基础课修习到课题攻关，与同门一起积累学识、法器和突破。</p>
            <b>继续校园修行 →</b>
          </button>
          <button
            className="rm-mode-choice is-expedition"
            onClick={() => setMode('rogue')}
          >
            <span className="rm-mode-number">02</span>
            <strong>灵枢试炼</strong>
            <span>独立肉鸽 · 3种流派 · 50关</span>
            <p>以课程术式构筑牌组，在工坊与试阵中炼器参悟，迎接结业天劫。</p>
            <b>进入灵枢试炼 →</b>
          </button>
        </div>
        <p className="rm-mode-note">
          两种修行共享学园设定，进度分别保存。试炼使用本局术式与法器。
        </p>
      </div>
    </main>
  );
}
