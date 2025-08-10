
# 电商数据统计网站 — 全托管周/月一体化（Supabase 持久化）

本版本实现：
- Excel 周报/⽉报自动判别，入库（同键去重）。
- 前端默认展示“上一周”（或“上一个月”）数据，若该期无数据则自动回溯到最近一期。
- 仅支持“周/⽉”两种时间粒度选择。
- 统一深色主题，DataTable 可滚动、分页。
- Vercel 无服务器 API（/api/ingest, /api/stats, /api/periods）。

## 一、环境变量（Vercel → Settings → Environment Variables）
```
SUPABASE_URL=你的 Supabase URL
SUPABASE_SERVICE_ROLE_KEY=你的 service_role 密钥
```
> 注：使用 service_role 是为了 serverless 端执行 UPSERT；请不要暴露在前端。

## 二、数据库结构（Supabase SQL）
```sql
create table if not exists managed_stats (
  period_type text check (period_type in ('week','month')) not null,
  period_end  date not null,
  product_id  text not null,
  product_link text,
  search_exposure bigint,
  uv bigint,
  pv bigint,
  add_to_cart_users bigint,
  add_to_cart_qty bigint,
  fav_users bigint,
  pay_items bigint,
  pay_orders bigint,
  pay_buyers bigint,
  pay_rate numeric,
  rank_percent numeric,
  is_warehouse boolean,
  suborders_30d bigint,
  is_premium boolean,
  inserted_at timestamptz default now(),
  primary key (period_type, period_end, product_id)
);

create table if not exists ingest_log (
  id bigserial primary key,
  file_name text,
  period_end date,
  detected_type text,
  row_count int,
  uv_sum bigint,
  created_at timestamptz default now()
);
```

> 如启用 RLS，请给 `managed_stats` 添加允许 service_role 的 policy 或直接关闭 RLS。

## 三、部署到 Vercel
项目结构：
```
vercel.json
public/
  index.html
  assets/theme.css
api/
  ingest.js
  stats.js
  periods.js
```

1. 推送到 GitHub/GitLab，然后在 Vercel 导入。
2. 配置环境变量，点击 Deploy。

## 四、使用方式
- 进入首页后默认显示**上一周**数据（若无则回溯直到找到最近一期）；顶部选择「周 / 月」可切换粒度。
- 点击绿色「选择文件」上传 Excel，会自动判别周/月并入库；成功后会自动刷新当前视图。
- 时间选择下拉来自后端 `/api/periods`，只展示数据库已有的期末日期（避免选到空数据）。

## 兼容说明
- 当统计日既是**周日**又是**月末**时，系统使用「行数 / UV 合计」与历史中位数对比做判定；首次无基线时采用行数阈值（默认 300）兜底。
