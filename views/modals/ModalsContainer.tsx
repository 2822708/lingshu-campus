import React, { Suspense } from 'react';
import { PlayerStats, Shop, GameSettings, Item } from '../../types';
import { BattleReplay } from '../../services/battleService';
import { CultivationArt, Recipe } from '../../types';
import { RandomSectTask } from '../../services/randomService';
import type { useEquipmentHandlers } from '../equipment/useEquipmentHandlers';
import type { useRealmHandlers } from '../realm/useRealmHandlers';
import type { useShopHandlers } from '../shop/useShopHandlers';
import type { GameSave } from '../../features/save/saveCodec';

// 首屏不需要的 15 个 modal 全部改成 lazy load
// 首屏只加载入口容器（~5KB），各 modal 在首次打开时按需下载
const InventoryModal = React.lazy(
  () => import('../../components/InventoryModal')
);
const CultivationModal = React.lazy(
  () => import('../../components/CultivationModal')
);
const AlchemyModal = React.lazy(() => import('../../components/AlchemyModal'));
const ArtifactUpgradeModal = React.lazy(
  () => import('../../components/ArtifactUpgradeModal')
);
const SectModal = React.lazy(() => import('../../components/SectModal'));
const SecretRealmModal = React.lazy(
  () => import('../../components/SecretRealmModal')
);
const BattleModal = React.lazy(() => import('../../components/BattleModal'));
const CharacterModal = React.lazy(
  () => import('../../components/CharacterModal')
);
const AchievementModal = React.lazy(
  () => import('../../components/AchievementModal')
);
const PetModal = React.lazy(() => import('../../components/PetModal'));
const LotteryModal = React.lazy(() => import('../../components/LotteryModal'));
const SettingsModal = React.lazy(
  () => import('../../components/SettingsModal')
);
const ShopModal = React.lazy(() => import('../../components/ShopModal'));

/** 加载占位符（首屏 modal 加载期间显示） */
const ModalLoading = () => (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-npu-panel border border-npu-border px-6 py-3 text-npu-code text-sm font-mono">
      加载中...
    </div>
  </div>
);

/**
 * 弹窗容器组件
 * 包含战斗、背包、课程、咖啡配方、外设强化、社团、副本、角色、成就、室友、抽奖、设置、商店弹窗
 * @param player 玩家数据
 * @param settings 游戏设置
 * @param modals 弹窗状态
 * @param modalState 弹窗状态
 * @param handlers 弹窗处理函数
 */

interface ModalsContainerProps {
  onImportSave: (save: GameSave) => void;
  player: PlayerStats;
  settings: GameSettings;
  setItemActionLog?: (log: { text: string; type: string } | null) => void;
  modals: {
    isInventoryOpen: boolean;
    isCultivationOpen: boolean;
    isAlchemyOpen: boolean;
    isUpgradeOpen: boolean;
    isSectOpen: boolean;
    isRealmOpen: boolean;
    isCharacterOpen: boolean;
    isAchievementOpen: boolean;
    isPetOpen: boolean;
    isLotteryOpen: boolean;
    isSettingsOpen: boolean;
    isShopOpen: boolean;
    isBattleModalOpen: boolean;
  };
  modalState: {
    currentShop: Shop | null;
    itemToUpgrade: Item | null;
    battleReplay: BattleReplay | null;
    revealedBattleRounds: number;
  };
  handlers: {
    // Modal toggles
    setIsInventoryOpen: (open: boolean) => void;
    setIsCultivationOpen: (open: boolean) => void;
    setIsAlchemyOpen: (open: boolean) => void;
    setIsUpgradeOpen: (open: boolean) => void;
    setIsSectOpen: (open: boolean) => void;
    setIsRealmOpen: (open: boolean) => void;
    setIsCharacterOpen: (open: boolean) => void;
    setIsAchievementOpen: (open: boolean) => void;
    setIsPetOpen: (open: boolean) => void;
    setIsLotteryOpen: (open: boolean) => void;
    setIsSettingsOpen: (open: boolean) => void;
    setIsShopOpen: (open: boolean) => void;
    setIsBattleModalOpen: (open: boolean) => void;
    setItemToUpgrade: (item: Item | null) => void;
    setCurrentShop: (shop: Shop | null) => void;
    setBattleReplay: (replay: BattleReplay | null) => void;
    setRevealedBattleRounds: (
      rounds: number | ((prev: number) => number)
    ) => void;
    // Battle
    handleSkipBattleLogs: () => void;
    handleCloseBattleModal: () => void;
    // Inventory
    handleUseItem: (item: Item) => void;
    handleUseItemBatch: (item: Item, count: number) => void;
    handleUseAllConsumables: () => void;
    handleEquipItem: ReturnType<typeof useEquipmentHandlers>['handleEquipItem'];
    handleUnequipItem: ReturnType<
      typeof useEquipmentHandlers
    >['handleUnequipItem'];
    handleAutoEquip: () => void;
    handleOpenUpgrade: (item: Item) => void;
    handleDiscardItem: (item: Item) => void;
    handleBatchDiscard: (itemIds: string[]) => void;
    handleRefineNatalArtifact: (item: Item) => void;
    handleUnrefineNatalArtifact: () => void;
    handleUpgradeItem: (
      item: Item,
      costStones: number,
      costMats: number,
      upgradeStones?: number
    ) => Promise<'success' | 'failure' | 'error'>;
    handleUpgradeItemAll: (
      item: Item,
      costStones: number,
      costMats: number
    ) => Promise<number>;
    // Cultivation
    handleLearnArt: (art: CultivationArt) => void;
    handleActivateArt: (art: CultivationArt) => void;
    handleLearnAllArts: () => void;
    // Alchemy
    handleCraft: (recipe: Recipe, count?: number) => void;
    // Sect
    handleJoinSect: (sectId: string, sectName?: string) => void;
    handleLeaveSect: () => void;
    handleSectTask: (task: RandomSectTask) => void;
    handleSectPromote: () => void;
    handleSectBuy: (
      itemTemplate: Partial<Item>,
      cost: number,
      quantity?: number
    ) => void;
    // Realm
    handleEnterRealm: ReturnType<typeof useRealmHandlers>['handleEnterRealm'];
    // Character
    handleSelectTalent: (talentId: string) => void;
    handleSelectTitle: (titleId: string) => void;
    handleAllocateAttribute: (type: 'attack' | 'defense' | 'hp') => void;
    handleAllocateAll: () => void;
    handleUseInheritance: () => void;
    handleUpdateViewedAchievements: () => void;
    // Pet
    handleActivatePet: (petId: string) => void;
    handleFeedPet: (
      petId: string,
      feedType: 'hp' | 'item' | 'exp',
      itemId?: string
    ) => void;
    handleEvolvePet: (petId: string) => void;
    handleAutoFeed: (petId: string) => void;
    handleDevourPet: (petId: string, sacrificedId: string) => void;
    // Lottery
    handleDraw: (count: 1 | 10) => void;
    // Settings
    handleUpdateSettings: (newSettings: Partial<GameSettings>) => void;
    // Shop
    handleBuyItem: ReturnType<typeof useShopHandlers>['handleBuyItem'];
    handleSellItem: (item: Item) => void;
  };
}

export default function ModalsContainer({
  onImportSave,
  player,
  settings,
  setItemActionLog,
  modals,
  modalState,
  handlers,
}: ModalsContainerProps) {
  return (
    <Suspense fallback={<ModalLoading />}>
      <BattleModal
        isOpen={modals.isBattleModalOpen}
        replay={modalState.battleReplay}
        revealedRounds={modalState.revealedBattleRounds}
        onSkip={handlers.handleSkipBattleLogs}
        onClose={handlers.handleCloseBattleModal}
      />

      <InventoryModal
        isOpen={modals.isInventoryOpen}
        onClose={() => handlers.setIsInventoryOpen(false)}
        inventory={player.inventory}
        equippedItems={player.equippedItems}
        player={player}
        onUseItem={handlers.handleUseItem}
        onUseItemBatch={handlers.handleUseItemBatch}
        onUseAllConsumables={handlers.handleUseAllConsumables}
        onEquipItem={handlers.handleEquipItem}
        onUnequipItem={handlers.handleUnequipItem}
        onAutoEquip={handlers.handleAutoEquip}
        onUpgradeItem={handlers.handleOpenUpgrade}
        onDiscardItem={handlers.handleDiscardItem}
        onBatchDiscard={handlers.handleBatchDiscard}
        onRefineNatalArtifact={handlers.handleRefineNatalArtifact}
        onUnrefineNatalArtifact={handlers.handleUnrefineNatalArtifact}
      />

      <CultivationModal
        isOpen={modals.isCultivationOpen}
        onClose={() => handlers.setIsCultivationOpen(false)}
        player={player}
        onLearnArt={handlers.handleLearnArt}
        onActivateArt={handlers.handleActivateArt}
        onLearnAllArts={handlers.handleLearnAllArts}
      />

      <AlchemyModal
        isOpen={modals.isAlchemyOpen}
        onClose={() => handlers.setIsAlchemyOpen(false)}
        player={player}
        onCraft={handlers.handleCraft}
      />

      <ArtifactUpgradeModal
        isOpen={modals.isUpgradeOpen}
        onClose={() => {
          handlers.setIsUpgradeOpen(false);
          handlers.setItemToUpgrade(null);
        }}
        item={modalState.itemToUpgrade}
        player={player}
        onConfirm={handlers.handleUpgradeItem}
        onUpgradeAll={handlers.handleUpgradeItemAll}
        setItemActionLog={setItemActionLog}
      />

      <SectModal
        isOpen={modals.isSectOpen}
        onClose={() => handlers.setIsSectOpen(false)}
        player={player}
        onJoinSect={handlers.handleJoinSect}
        onLeaveSect={handlers.handleLeaveSect}
        onTask={handlers.handleSectTask}
        onPromote={handlers.handleSectPromote}
        onBuy={handlers.handleSectBuy}
      />

      <SecretRealmModal
        isOpen={modals.isRealmOpen}
        onClose={() => handlers.setIsRealmOpen(false)}
        player={player}
        onEnter={handlers.handleEnterRealm}
      />

      <CharacterModal
        isOpen={modals.isCharacterOpen}
        onClose={() => handlers.setIsCharacterOpen(false)}
        player={player}
        onSelectTalent={handlers.handleSelectTalent}
        onSelectTitle={handlers.handleSelectTitle}
        onAllocateAttribute={handlers.handleAllocateAttribute}
        onAllocateAll={handlers.handleAllocateAll}
        onUseInheritance={handlers.handleUseInheritance}
      />

      <AchievementModal
        isOpen={modals.isAchievementOpen}
        onClose={() => handlers.setIsAchievementOpen(false)}
        player={player}
      />

      <PetModal
        isOpen={modals.isPetOpen}
        onClose={() => handlers.setIsPetOpen(false)}
        player={player}
        onActivatePet={handlers.handleActivatePet}
        onFeedPet={handlers.handleFeedPet}
        onEvolvePet={handlers.handleEvolvePet}
        onAutoFeed={handlers.handleAutoFeed}
        onDevourPet={handlers.handleDevourPet}
      />

      <LotteryModal
        isOpen={modals.isLotteryOpen}
        onClose={() => handlers.setIsLotteryOpen(false)}
        player={player}
        onDraw={handlers.handleDraw}
      />

      <SettingsModal
        isOpen={modals.isSettingsOpen}
        onClose={() => handlers.setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={handlers.handleUpdateSettings}
        onImportSave={onImportSave}
      />

      {modalState.currentShop && (
        <ShopModal
          isOpen={modals.isShopOpen}
          onClose={() => {
            handlers.setIsShopOpen(false);
            handlers.setCurrentShop(null);
          }}
          shop={modalState.currentShop}
          player={player}
          onBuyItem={handlers.handleBuyItem}
          onSellItem={handlers.handleSellItem}
        />
      )}
    </Suspense>
  );
}
