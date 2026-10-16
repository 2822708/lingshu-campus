import React, { useState, useEffect, useMemo } from 'react';
import { ArrowRight, Plus, Trophy, Trash2 } from 'lucide-react';
import { SAVE_KEY } from '../utils/gameUtils';
import { findLingGen, findMingGe } from '../npu-data';
import AIConfigPanel from './AIConfigPanel';
import LeaderboardPanel from './LeaderboardPanel';
import { extractPlayerName } from '../utils/uidApi';
import { CAMPUS_THEME } from '../config/campusTheme';

interface HomeScreenProps {
  hasSave: boolean;
  onNewGame: () => void;
  onContinueGame: () => void;
  onDeleteSave: () => void;
}

interface SavePreview {
  playerName: string;
  lingGenName: string;
  mingGeName: string;
  realm: string;
  realmLevel: number;
  credits: number;
  pets: number;
  achievements: number;
  lotteryTickets: number;
  hp: number;
  maxHp: number;
  attack: number;
  exp: number;
  maxExp: number;
  timestamp: number;
}

/** 成长档案封页：存档与继续游戏优先，设置和管理操作置于辅助区。 */
const HomeScreen: React.FC<HomeScreenProps> = ({
  hasSave,
  onNewGame,
  onContinueGame,
  onDeleteSave,
}) => {
  const [preview, setPreview] = useState<SavePreview | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);

  useEffect(() => {
    if (!hasSave) {
      setPreview(null);
      return;
    }
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      const p = saved.player;
      if (!p) return;
      let lingGenName = '未知专业';
      let mingGeName = '平民命';
      if (typeof p.talentId === 'string' && p.talentId.startsWith('npu:')) {
        const parts = p.talentId.split(':');
        lingGenName = findLingGen(parts[1])?.name || lingGenName;
        mingGeName = findMingGe(parts[2])?.name || parts[2] || mingGeName;
      }
      setPreview({
        playerName: extractPlayerName(p.name || '无名同学'),
        lingGenName,
        mingGeName,
        realm: p.realm || '大一',
        realmLevel: p.realmLevel || 1,
        credits: p.spiritStones || 0,
        pets: p.pets?.length || 0,
        achievements: p.achievements?.length || 0,
        lotteryTickets: p.lotteryTickets || 0,
        hp: p.hp || 0,
        maxHp: p.maxHp || 0,
        attack: p.attack || 0,
        exp: p.exp || 0,
        maxExp: p.maxExp || 100,
        timestamp: saved.timestamp || Date.now(),
      });
    } catch (error) {
      console.error('解析存档预览失败:', error);
    }
  }, [hasSave]);

  const saveTime = useMemo(() => {
    if (!preview) return '';
    const mins = Math.floor((Date.now() - preview.timestamp) / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return mins + ' 分钟前';
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours + ' 小时前';
    return Math.floor(hours / 24) + ' 天前';
  }, [preview]);

  return (
    <div className="paper-entry-page">
      <div className="paper-entry-wrap">
        <header className="paper-entry-masthead">
          <span>{CAMPUS_THEME.description}</span>
          <span>个人成长档案</span>
        </header>
        <main className="paper-entry-sheet paper-entry-cover">
          <section
            className="paper-entry-cover-title"
            aria-labelledby="home-title"
          >
            <p className="paper-entry-eyebrow">校园生活 · 文字冒险</p>
            <h1 id="home-title">{CAMPUS_THEME.title.split(' · ')[0]}</h1>
            <p className="paper-entry-subtitle">{CAMPUS_THEME.subtitle}</p>
            <div className="paper-entry-title-rule" />
            <p className="paper-entry-intro">
              一份关于学业、社团与校园日常的成长档案。
            </p>
            <div className="paper-entry-cover-caption">
              {CAMPUS_THEME.motto}
            </div>
          </section>
          <section
            className="paper-entry-current"
            aria-labelledby="progress-title"
          >
            <div className="paper-entry-section-heading">
              <h2 id="progress-title">
                {hasSave ? '上次的校园生活' : '建立成长档案'}
              </h2>
              <span>{hasSave ? '当前存档' : '尚未建立档案'}</span>
            </div>
            {hasSave && preview ? (
              <>
                <div className="paper-entry-student">
                  <h3>{preview.playerName}</h3>
                  <span>
                    {preview.realm} · {preview.realmLevel} 级
                  </span>
                </div>
                <dl className="paper-entry-record">
                  <div>
                    <dt>专业</dt>
                    <dd>{preview.lingGenName}</dd>
                  </div>
                  <div>
                    <dt>命格</dt>
                    <dd>{preview.mingGeName}</dd>
                  </div>
                  <div>
                    <dt>保存于</dt>
                    <dd>{saveTime}</dd>
                  </div>
                </dl>
                <dl className="paper-entry-save-stats">
                  <Stat
                    label="精力"
                    value={preview.hp + ' / ' + preview.maxHp}
                  />
                  <Stat
                    label="绩点"
                    value={preview.exp + ' / ' + preview.maxExp}
                  />
                  <Stat label="学分" value={preview.credits} />
                  <Stat label="攻击" value={preview.attack} />
                  <Stat label="室友" value={preview.pets} />
                  <Stat label="成就" value={preview.achievements} />
                  <Stat label="抽奖券" value={preview.lotteryTickets} />
                </dl>
              </>
            ) : (
              <div className="paper-entry-empty">
                <span className="paper-entry-empty-mark" aria-hidden="true">
                  入学
                </span>
                <h3>{hasSave ? '已有本地存档' : '尚无本地存档'}</h3>
                <p>
                  {hasSave
                    ? '继续读取当前存档，接上上次的校园生活。'
                    : '选择学部、抽取命格并登记姓名，即可开始游戏。'}
                </p>
              </div>
            )}
            <div className="paper-entry-main-actions">
              {hasSave && (
                <button
                  className="paper-entry-button paper-entry-button-primary"
                  onClick={onContinueGame}
                >
                  继续校园生活 <ArrowRight size={18} />
                </button>
              )}
              <button
                className={
                  'paper-entry-button ' +
                  (hasSave
                    ? 'paper-entry-button-secondary'
                    : 'paper-entry-button-primary')
                }
                onClick={onNewGame}
              >
                <Plus size={17} />{' '}
                {hasSave ? '新建成长档案' : '开始我的校园生活'}
              </button>
              <p className="paper-entry-small-note">进度保存在当前浏览器中。</p>
            </div>
          </section>
        </main>
        <section className="paper-entry-aux" aria-label="其他选项">
          <div className="paper-entry-aux-heading">
            <span>其他选项</span>
            <button
              className="paper-entry-link"
              onClick={() => setLeaderboardOpen(true)}
            >
              <Trophy size={15} /> 校园排行榜 <ArrowRight size={14} />
            </button>
          </div>
          <div className="paper-entry-ai">
            <AIConfigPanel defaultCollapsed={true} />
          </div>
          {hasSave && (
            <div className="paper-entry-save-management">
              {!confirmingDelete ? (
                <button
                  className="paper-entry-link paper-entry-danger-link"
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2 size={14} /> 删除当前存档
                </button>
              ) : (
                <div className="paper-entry-delete-confirm" role="alert">
                  <p>确认删除当前存档？此操作不可恢复。</p>
                  <div>
                    <button
                      className="paper-entry-button paper-entry-button-secondary"
                      onClick={() => setConfirmingDelete(false)}
                    >
                      取消
                    </button>
                    <button
                      className="paper-entry-button paper-entry-button-danger"
                      onClick={() => {
                        onDeleteSave();
                        setConfirmingDelete(false);
                      }}
                    >
                      确认删除
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
        <footer className="paper-entry-footer">
          <span>{CAMPUS_THEME.title}</span>
          <span>{CAMPUS_THEME.footer}</span>
        </footer>
      </div>
      <LeaderboardPanel
        isOpen={leaderboardOpen}
        onClose={() => setLeaderboardOpen(false)}
        currentPlayerName={preview?.playerName}
      />
    </div>
  );
};

const Stat: React.FC<{ label: string; value: React.ReactNode }> = ({
  label,
  value,
}) => (
  <div>
    <dt>{label}</dt>
    <dd>{value}</dd>
  </div>
);

export default HomeScreen;
