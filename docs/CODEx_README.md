# Codex 分支更新与数据库建设指引（独立站 · Landing Pages）

目标：
- 在当前分支新增独立站“Landing Pages 明细”页面（`independent-site.html`）。
- 新建 Supabase 表 `independent_landing_metrics` 并提供两个 API：
  - `POST /api/independent/ingest`：上传 Google Ads 导出的 xlsx/csv，自动 upsert。
  - `GET  /api/independent/stats`：按站点、日期区间返回表格数据与图表数据。

## 1. 代码变更（提交到当前分支）
新增文件：
- `independent-site.html`
- `api/independent/ingest/index.js`
- `api/independent/stats/index.js`
- `sql/independent_landing_pages.sql`

注意：页面引用的样式是 `assets/theme-unified-0812.css`，若你的仓库已有该文件，请保持路径一致；否则把它拷入 `/assets/` 并修改 `<link>`。

## 2. 环境变量（Vercel）
在 Vercel 项目 → Settings → Environment Variables：
- `SUPABASE_URL`：你的 Supabase 项目 URL
- `SUPABASE_ANON_KEY`：匿名密钥（读）
- `SUPABASE_SERVICE_ROLE`：服务密钥（写/Upsert，推荐用于 ingest 接口）

## 3. 建表（Supabase）
进入 Supabase → SQL Editor，执行：
- `sql/independent_landing_pages.sql` 的内容。

这会创建：
- 表 `public.independent_landing_metrics`（唯一约束：`(day, site, landing_path, device, network, campaign)`）
- 视图 `public.independent_landing_summary_by_day`
- 索引与简单的 RLS（允许读取/写入/更新，如需更细粒度再加策略）

## 4. 数据导入（两种途径）
- 网页（推荐）：访问 `independent-site.html` → 点“上传数据接口”查看接口地址；用 Postman/网页表单以 `multipart/form-data` 提交字段名 `file`（xlsx 或 csv）。
- CI：把 Google Ads 导出文件放在 CI 工件中，通过 `curl` 向 `/api/independent/ingest` 发送 POST。

## 5. 页面使用
- 访问：`/independent-site.html?site=poolsvacuum.com&from=2025-05-17&to=2025-08-12`
- “运营分析”页签：展示日趋势 & Top Landing Pages；“明细表”页签：逐行明细。

## 6. 合并上线
- 推送到 `feature/independent-landing` 分支 → Vercel 自动生成 Preview。
- 验证通过后：
  - 在 Vercel 部署详情页点击 **Promote to Production**；或
  - 合并到生产分支（Production Branch）。
