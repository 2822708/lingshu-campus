# 数值审计探针

审计基线为 `d021986`，报告见 `doc/数值审计报告-2026-10-15.md`。这些脚本记录真实处理函数在受控输入下的数值，包含对已知缺陷的诊断断言；完成运行不表示系统正确。它们不加入 `npm test`，以免把缺陷误当作应长期保持的正确行为。

在仓库根目录运行，传入独立输出目录：

```powershell
node scripts/numerical-audit/run.mjs . 'E:/codex work/2026-10-15/e-projects-xiuxian-npu/work/numerical-audit-rerun'
```

使用本项目已安装的 esbuild 和 Node，不安装新依赖，不调用真实 AI/后端，也不读取用户浏览器存档。growth、equipment、battle、economy 四组分别检查成长、物品装备、战斗冒险和外围经济。只通过 `run.mjs` 运行，不单独执行 probe 文件。

探针以内存状态更新器同步应用 React 函数式更新；battle 组替代了入口所需的 useRef，未模拟 React 渲染或浏览器调度。因此旧回调重复消费等观测应作为待浏览器复核的边界，不能声称已通过普通 UI 演示。受控初始状态不等于真实用户存档。

正常规则被修复后，一些诊断断言会不再成立。届时应按设计新增正确性回归，再更新审计基线，不能通过维持缺陷来让这些旧探针“全绿”。
