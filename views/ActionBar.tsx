import React from 'react';
import { BookOpen, GraduationCap, Mountain, Coffee, Users } from 'lucide-react';

interface ActionBarProps {
  loading: boolean;
  cooldown: number;
  onMeditate: () => void;
  onAdventure: () => void;
  onOpenRealm: () => void;
  onOpenAlchemy: () => void;
  onOpenSect: () => void;
  autoMeditate: boolean;
  autoAdventure: boolean;
  onToggleAutoMeditate: () => void;
  onToggleAutoAdventure: () => void;
}

function ActionBar({
  loading,
  cooldown,
  onMeditate,
  onAdventure,
  onOpenRealm,
  onOpenAlchemy,
  onOpenSect,
  autoMeditate,
  autoAdventure,
  onToggleAutoMeditate,
  onToggleAutoAdventure,
}: ActionBarProps) {
  return (
    <section className="paper-nav-actions" aria-label="校园行动">
      <div className="paper-nav-actions-heading">
        <h2>今日行动</h2>
        <span aria-live="polite">
          {loading
            ? '期末进行中'
            : cooldown > 0
              ? `休息 ${cooldown} 秒`
              : '循序渐进，日有所长'}
        </span>
      </div>
      <div className="paper-nav-primary-actions">
        <ActionChoice
          title="自习"
          description="温习课程，积累成长"
          icon={<BookOpen size={20} aria-hidden="true" />}
          onClick={onMeditate}
          disabled={loading || cooldown > 0}
          autoLabel="自动自习"
          autoActive={autoMeditate}
          onToggleAuto={onToggleAutoMeditate}
        />
        <ActionChoice
          title={loading ? '期末进行中…' : '期末周'}
          description="应对考验，遇见奇遇"
          icon={<GraduationCap size={21} aria-hidden="true" />}
          onClick={onAdventure}
          disabled={loading || cooldown > 0}
          autoLabel="自动期末周"
          autoActive={autoAdventure}
          onToggleAuto={onToggleAutoAdventure}
        />
      </div>
      <div className="paper-nav-secondary-actions">
        <button type="button" onClick={onOpenRealm} disabled={loading}>
          <Mountain size={17} aria-hidden="true" />
          考研副本
        </button>
        <button type="button" onClick={onOpenAlchemy} disabled={loading}>
          <Coffee size={17} aria-hidden="true" />
          咖啡店
        </button>
        <button type="button" onClick={onOpenSect}>
          <Users size={17} aria-hidden="true" />
          社团
        </button>
      </div>
    </section>
  );
}

function ActionChoice({
  title,
  description,
  icon,
  onClick,
  disabled,
  autoLabel,
  autoActive,
  onToggleAuto,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  autoLabel: string;
  autoActive: boolean;
  onToggleAuto: () => void;
}) {
  return (
    <div className="paper-nav-action-choice" data-active={autoActive}>
      <button
        type="button"
        className="paper-nav-main-action"
        onClick={onClick}
        disabled={disabled}
      >
        {icon}
        <span>
          <strong>{title}</strong>
          <small>{description}</small>
        </span>
      </button>
      <button
        type="button"
        className="paper-nav-auto-toggle"
        role="switch"
        aria-checked={autoActive}
        onClick={(event) => {
          event.stopPropagation();
          onToggleAuto();
        }}
      >
        <span className="paper-nav-switch" aria-hidden="true" />
        <span>{autoLabel}</span>
        <small aria-hidden="true">{autoActive ? '已开启' : '关闭'}</small>
      </button>
    </div>
  );
}

export default React.memo(ActionBar);
