# Features 模块结构

> 2026-10-15 现状：`modal/` 已接入 App，新增 `save/` 已接入存档流程；其他旧 Hook 尚未接入主运行链。下方目录清单保留历史迁移意图，部分目录尚不存在。当前实际边界见 [模块说明](../doc/MODULE_BOUNDARIES.md)。

本文件夹按功能模块组织游戏逻辑，每个模块包含对应的hooks和工具函数。

## 目录结构

- `meditation/` - 打坐功能
- `adventure/` - 历练和秘境功能
- `breakthrough/` - 突破功能
- `items/` - 物品管理（使用、丢弃）
- `equipment/` - 装备系统（装备、卸下、本命法宝、升级）
- `shop/` - 商店系统
- `cultivation/` - 功法系统
- `alchemy/` - 炼丹系统
- `sect/` - 宗门系统
- `character/` - 角色系统
- `achievements/` - 成就系统
- `pets/` - 灵宠系统
- `lottery/` - 抽奖系统
- `battle/` - 战斗相关
- `modal/` - 模态框状态管理
- `game/` - 游戏通用功能（冷却、加载等）

## 使用方式

`features/index.ts` 保留历史兼容导出，不表示这些 Hook 均已使用。App 按实际文件路径使用 `modal/useModalState`；useGameState 使用 `save/saveCodec` 与 `save/autoSaveScheduler`。其他功能以 `views/*Handlers` 为准，不要直接切换旧实现。

存档与调度回归运行 `npm test`。本轮不改变主题词、玩法数值、存档键和版本。
