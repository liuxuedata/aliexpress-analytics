
# Codex 任务说明

我上传了 design-handoff-v2.1/：

- specs/guide.md（设计指导文档）
- tokens.json
- styles/theme.css
- tailwind.config.js
- scripts/chart.defaults.js

## 改造要求
1. 全站引入 styles/theme.css，将 Tailwind 配置替换为我提供的 tailwind.config.js 并重建。
2. 以 tokens 为唯一事实来源：禁止在组件中写死颜色/间距/圆角/阴影；渐变使用 .bg-gradient-* 工具类。
3. 重构页面布局为“顶部导航 + 左侧固定 256px + 右侧滚动内容”，容器使用 mx-auto max-w-container px-6。
4. 组件层：统一按钮、下拉、Modal、KPI 卡片、表格样式到规范；补齐 :hover / :focus-visible / :disabled。
5. 图表统一使用 chart.defaults.js 配置与 chartColors 调色；图表与表格懒加载/分页。
6. 平台色与状态徽章使用 --brand-* 与 .status-* 变量/类，不得硬编码。
7. 输出变更文件列表与 diff，并列出任何与既有代码冲突之处（例如主题命名、断点差异）。

## 附加优化建议
1. 暗色模式开关：留个 data-theme="dark" 的覆盖层（已在 theme.css 和 tokens.json 中占位）。
2. 按钮/输入的状态：disabled、loading（带 spinner）、invalid 警示边框。
3. 可访问性：已加 :focus-visible，补充颜色对比（WCAG AA）检查清单。
4. 图标体系一致性：若项目里已用 lucide/shadcn，二选一，避免混用。
5. 表格空态/异常态：无数据、加载失败、筛选无结果的占位卡片。
6. 平台数据 schema 版本号：给 headers/data 加 "version": "1.0.0"。
