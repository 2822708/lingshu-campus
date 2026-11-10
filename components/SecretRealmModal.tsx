import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PlayerStats, SecretRealm } from '../types';
import { REALM_ORDER } from '../constants';
import { RefreshCw, X } from 'lucide-react';
import type { CardLoadout } from '../features/card-dungeon/loadout';
import { generateRogueDungeonOffers } from '../features/card-dungeon/offers';
import '../features/card-dungeon/ui/rogue-entry.css';

export interface SecretRealmOfferBatch {
  revision: string;
  offers: SecretRealm[];
}
interface Props {
  isOpen: boolean;
  onClose: () => void;
  player: PlayerStats;
  error?: string;
  onEnter?: (realm: SecretRealm) => void;
  onEnterCardDungeon?: (
    offerId: string,
    batchRevision: string,
    loadoutRevision: number
  ) => boolean | void;
  onOffersChange?: (batch: SecretRealmOfferBatch) => void;
  cardLoadout?: CardLoadout;
  /** Kept for older hosts; the three-choice entrance has no preparation step. */
  onSaveCardLoadout?: (next: CardLoadout, expectedRevision: number) => boolean;
}

const SecretRealmModal: React.FC<Props> = ({
  isOpen,
  onClose,
  player,
  onEnter,
  error,
  onEnterCardDungeon,
  onOffersChange,
  cardLoadout,
}) => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [entryError, setEntryError] = useState('');
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  // Ordinary player updates do not reroll choices or invalidate their prices.
  const batch = useMemo<SecretRealmOfferBatch>(
    () => ({
      revision: `dungeon-${player.realm}-${refreshKey}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      offers: generateRogueDungeonOffers(player.realm),
    }),
    [player.realm, refreshKey]
  );
  useEffect(() => {
    if (isOpen) onOffersChange?.(batch);
  }, [batch, isOpen, onOffersChange]);
  useEffect(() => {
    if (!isOpen) setEntryError('');
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    const element = dialog.current;
    const oldFocus = document.activeElement;
    const firstChoice = element?.querySelector<HTMLButtonElement>(
      '.cd-route-card:not([disabled])'
    );
    const fallback = element?.querySelector<HTMLButtonElement>(
      'button:not([disabled])'
    );
    (firstChoice ?? fallback ?? element)?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = [
        ...(element?.querySelectorAll<HTMLButtonElement>(
          'button:not([disabled])'
        ) ?? []),
      ];
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) {
        event.preventDefault();
        element?.focus();
      } else if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === element)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !element?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    const contain = (event: FocusEvent) => {
      if (event.target instanceof Node && !element?.contains(event.target)) {
        const currentChoice = element?.querySelector<HTMLButtonElement>(
          '.cd-route-card:not([disabled])'
        );
        const currentFallback = element?.querySelector<HTMLButtonElement>(
          'button:not([disabled])'
        );
        (currentChoice ?? currentFallback ?? element)?.focus();
      }
    };
    document.addEventListener('keydown', trap, true);
    document.addEventListener('focusin', contain);
    return () => {
      document.removeEventListener('keydown', trap, true);
      document.removeEventListener('focusin', contain);
      if (oldFocus instanceof HTMLElement && oldFocus.isConnected)
        oldFocus.focus();
    };
  }, [isOpen]);
  if (!isOpen) return null;
  const enoughEnergy = player.hp > 0 && player.hp >= player.maxHp * 0.3;
  const currentRealm = REALM_ORDER.indexOf(player.realm);
  function enter(realm: SecretRealm) {
    setEntryError('');
    if (onEnterCardDungeon) {
      if (
        onEnterCardDungeon(
          realm.id,
          batch.revision,
          cardLoadout?.revision ?? 0
        ) === false
      )
        setEntryError('本次挑战尚未开始。请查看保存提示，或刷新选择后重试。');
    } else onEnter?.(realm);
  }
  return (
    <div className="cd-route-overlay" onClick={onClose}>
      <section
        className="cd-route-dialog"
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="考研副本列表"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="cd-route-heading">
          <div>
            <p>考研副本 · 三选一</p>
            <h3>选择下一场挑战</h3>
          </div>
          <div className="cd-route-actions">
            <button
              type="button"
              title="刷新副本列表"
              aria-label="刷新副本列表"
              onClick={() => {
                setEntryError('');
                setRefreshKey((value) => value + 1);
              }}
            >
              <RefreshCw size={14} aria-hidden="true" /> 刷新
            </button>
            <button
              type="button"
              className="cd-route-close"
              aria-label="关闭"
              onClick={onClose}
            >
              <X size={21} aria-hidden="true" />
            </button>
          </div>
        </header>
        <p className="cd-route-intro">
          从已学课程与穿戴装备中抽牌，每局随机战术。选一项，直接开战。
        </p>
        {(error || entryError) && (
          <p className="cd-route-message" role="alert">
            {error || entryError}
          </p>
        )}
        {!enoughEnergy && (
          <p className="cd-route-message" role="status">
            精力不足三成，请先恢复后挑战。
          </p>
        )}
        <div className="cd-route-options" aria-label="本次三个副本选择">
          {batch.offers.map((realm, index) => {
            const locked = currentRealm < REALM_ORDER.indexOf(realm.minRealm);
            const canAfford = player.spiritStones >= realm.cost;
            const disabled =
              locked ||
              !canAfford ||
              !enoughEnergy ||
              (!onEnterCardDungeon && !onEnter);
            const reason = locked
              ? '学阶不足'
              : !canAfford
                ? '学分不足'
                : !enoughEnergy
                  ? '精力不足'
                  : '进入挑战';
            return (
              <button
                type="button"
                key={realm.id}
                className="cd-route-card"
                data-risk={realm.riskLevel}
                data-testid="dungeon-offer"
                disabled={disabled}
                onClick={() => enter(realm)}
                aria-label={`${realm.name}，${realm.riskLevel}风险，报名消耗${realm.cost}学分，${reason}`}
              >
                <span className="cd-route-top">
                  <span className="cd-route-number">0{index + 1}</span>
                  <span className="cd-route-risk">{realm.riskLevel}风险</span>
                </span>
                <strong className="cd-route-name">{realm.name}</strong>
                <span className="cd-route-description">
                  {realm.description}
                </span>
                <span className="cd-route-drops">
                  <small>可能获得</small>
                  <span>{realm.drops.join(' · ')}</span>
                </span>
                <span className="cd-route-cost">
                  <span>
                    <b>{realm.cost}</b> 学分
                  </span>
                  <span>{disabled ? reason : '选择 →'}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};
export default SecretRealmModal;
