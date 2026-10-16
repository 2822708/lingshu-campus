import React, { useState, useMemo } from 'react';
import { PlayerStats } from '../types';
import { CULTIVATION_ARTS, TALENTS } from '../constants';
import { findLingGen, findMingGe } from '../npu-data';
import { extractPlayerName } from '../utils/uidApi';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { CAMPUS_THEME } from '../config/campusTheme';

interface Props {
  player: PlayerStats;
}

const StatsPanel: React.FC<Props> = ({ player }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const expPercentage = useMemo(
    () => Math.min(100, (player.exp / player.maxExp) * 100),
    [player.exp, player.maxExp]
  );
  const hpPercentage = useMemo(
    () => Math.min(100, (player.hp / player.maxHp) * 100),
    [player.hp, player.maxHp]
  );

  const activeArt = useMemo(
    () => CULTIVATION_ARTS.find((a) => a.id === player.activeArtId),
    [player.activeArtId]
  );

  const natalArtifact = useMemo(
    () =>
      player.natalArtifactId
        ? player.inventory.find((i) => i.id === player.natalArtifactId)
        : null,
    [player.natalArtifactId, player.inventory]
  );

  const identity = useMemo(() => {
    const parts = player.talentId?.split(':') || [];
    const major = parts[0] === 'npu' ? findLingGen(parts[1]) : undefined;
    const destiny = parts[0] === 'npu' ? findMingGe(parts[2]) : undefined;
    const legacyTalent = TALENTS.find(
      (talent) => talent.id === player.talentId
    );
    return {
      college: major?.college,
      major: major?.name || '未登记',
      destiny: destiny?.name || legacyTalent?.name || '未登记',
    };
  }, [player.talentId]);

  const attributes = [
    ['攻击', player.attack],
    ['防御', player.defense],
    ['思维', player.spirit],
    ['体能', player.physique],
    ['手速', player.speed],
  ] as const;

  return (
    <aside className="student-record" aria-label="学籍档案">
      <header className="student-record__header">
        <div className="student-record__section-title">
          <span>学籍档案</span>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="student-record__toggle md:hidden"
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? '展开学籍档案' : '收起学籍档案'}
          >
            {isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </button>
        </div>
        <h2 className="student-record__name" title={player.name}>
          {extractPlayerName(player.name)}
        </h2>
        <p className="student-record__stage">
          {player.realm} · {player.realmLevel} 级
        </p>
      </header>

      <div
        className={`student-record__body ${isCollapsed ? 'hidden md:flex' : 'flex'}`}
      >
        <dl className="student-record__identity">
          {identity.college && (
            <div>
              <dt>学部</dt>
              <dd>{identity.college}</dd>
            </div>
          )}
          <div>
            <dt>专业</dt>
            <dd>{identity.major}</dd>
          </div>
          <div>
            <dt>命格</dt>
            <dd>{identity.destiny}</dd>
          </div>
        </dl>

        <section className="student-record__vitals" aria-label="学业状态">
          <div className="student-record__vital">
            <div className="student-record__value-line">
              <span>精力</span>
              <span>
                <strong>{player.hp}</strong>
                <span className="student-record__maximum">
                  {' '}
                  / {player.maxHp}
                </span>
              </span>
            </div>
            <div
              className="student-record__progress"
              role="progressbar"
              aria-label="精力"
              aria-valuenow={player.hp}
              aria-valuemin={0}
              aria-valuemax={player.maxHp}
            >
              <div
                className="student-record__progress-fill student-record__progress-fill--energy"
                style={{ width: `${hpPercentage}%` }}
              />
            </div>
          </div>
          <div className="student-record__vital">
            <div className="student-record__value-line">
              <span>绩点</span>
              <span>
                <strong>{Math.floor(player.exp)}</strong>
                <span className="student-record__maximum">
                  {' '}
                  / {player.maxExp}
                </span>
              </span>
            </div>
            <div
              className="student-record__progress"
              role="progressbar"
              aria-label="绩点"
              aria-valuenow={Math.floor(player.exp)}
              aria-valuemin={0}
              aria-valuemax={player.maxExp}
            >
              <div
                className="student-record__progress-fill"
                style={{ width: `${expPercentage}%` }}
              />
            </div>
          </div>
          <div className="student-record__credits">
            <span>可用学分</span>
            <strong>{player.spiritStones}</strong>
          </div>
        </section>

        <section
          className="student-record__section"
          aria-label="当前学习与装备"
        >
          <dl className="student-record__details">
            <div>
              <dt>理论课</dt>
              <dd>{activeArt ? activeArt.name : '未选课'}</dd>
            </div>
            <div>
              <dt>主力外设</dt>
              <dd title={natalArtifact?.rarity}>
                {natalArtifact ? natalArtifact.name : '未装备'}
              </dd>
            </div>
          </dl>
        </section>

        <section className="student-record__section">
          <h3 className="student-record__subtitle">基础能力</h3>
          <dl className="student-record__attributes">
            {attributes.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {(player.lotteryTickets > 0 || player.inheritanceLevel > 0) && (
          <dl className="student-record__extras">
            {player.lotteryTickets > 0 && (
              <div>
                <dt>抽奖券</dt>
                <dd>{player.lotteryTickets}</dd>
              </div>
            )}
            {player.inheritanceLevel > 0 && (
              <div>
                <dt>保研加分</dt>
                <dd>{player.inheritanceLevel}</dd>
              </div>
            )}
          </dl>
        )}

        <p className="student-record__motto">{CAMPUS_THEME.motto}</p>
      </div>
    </aside>
  );
};

export default React.memo(StatsPanel);
