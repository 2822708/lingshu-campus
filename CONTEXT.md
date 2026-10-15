# 项目维护上下文

本项目是以南邮校园成长为主题的 React 游戏。当前实现与模块边界见 [模块说明](doc/MODULE_BOUNDARIES.md)，本轮工作见 [工作报告](doc/工作报告-2026-10-15.md)。`PLAN.md` 保留历史策划，不能据此认定功能已经实现。主题词和枚举值以 `doc/THEME-MAP.md`、`types.ts` 为准。

入口为 `index.tsx → App.tsx`；`views/*Handlers` 实现主要业务，`services` 实现战斗和文本服务，`utils` 提供领域工具，`components` 展示页面与弹窗。`features/modal` 已接入 App，`features/save` 负责存档协议和调度。其他旧 features Hook 尚未接入，不应直接替换现有 handlers。

维护约束：保持玩法、数值、存档字段与版本；不引入状态库或整体搬迁目录。首轮保留界面；用户随后明确选择“纸本校园风，像课程表和成长档案”，因此展示层现采用纸色、墨绿、档案与手记布局。架构决策使用项目已有的 `doc/adr/`，见 [增量模块化决策](doc/adr/0001-incremental-modularization.md) 与 [纸本校园视觉决策](doc/adr/0002-paper-campus-interface.md)。

检查命令：`npm test`、`npm run typecheck`、`npm run build`、`npm run lint -- --max-warnings 0`。后续已清理 90 个历史错误与 45 条警告，当前全量 ESLint 为 0 错误 0 警告、19 项回归通过，见 [历史问题修复报告](doc/历史问题修复报告-2026-10-15.md)。网络排行榜、UID 和 AI 仍需要单独做集成验证。

纸本校园界面实现与浏览器验证见 [界面工作报告](doc/纸本校园界面工作报告-2026-10-15.md)。主题变量在 `index.css`，入口、导航、档案与手记样式分别位于 `styles/` 下三个 CSS 文件。
