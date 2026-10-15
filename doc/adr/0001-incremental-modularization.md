# 0001 保持现有游戏设计的增量模块化

状态：已采用。日期：2026 年 10 月 15 日。

## 背景

项目已形成 App、views handlers、服务、工具和组件的运行链，但存档迁移仍写在状态 Hook 中，App 重复维护了已有模块内的弹窗状态。旧 features 的部分 Hook 与当前玩法不同，直接替换会改变收益、冷却和战斗展示。

## 决策

保留 React Hooks、当前页面、数值、字段、枚举和存档版本。将协议及兼容补齐提取到 `features/save/saveCodec.ts`，将有等待上限的防抖提取到 `features/save/autoSaveScheduler.ts`，通过现有 useGameState 接入；复用 `features/modal/useModalState.ts` 统一非战斗弹窗状态。

修复旧版本导入覆盖、连续更新推迟保存和条件调用 Hook 的实现缺陷。导入检查不承担完整 schema 校验。ESLint 9 改用 flat config，保留规则级别，Hooks 仅启用基础规则；使用 Node 内置测试覆盖存档与调度器。

## 影响

持久化逻辑可独立测试，弹窗状态有统一归属。App 的自动操作和战斗编排没有整体迁移，旧 features 仍不能混用；混合职责和全量 lint 历史问题需后续处理。本轮不新增状态库，不更换构建框架。
