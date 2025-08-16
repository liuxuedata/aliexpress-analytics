# Ozon 模块产品设计与开发规范 v1.0

> 角色：产品经理（面向 Codex 的可落地开发说明）\
> 目标：在现有站点框架中新增 **Ozon** 模块（左侧全局导航一级），包含 **数据明细**、**运营分析** 与 **产品分析** 三个页面；同时定义数据库、接口契约与前端交互，复用/对齐“自运营页面”的体验与组件。

---

## 1. 信息架构（IA）与导航

- 顶部全局模块保持一致：**独立站 / 速卖通 / TikTok Shop / 亚马逊 / Ozon / …**
- 左侧导航在点击 **Ozon** 后展开：
  - **数据明细（按日）** `ozon-detail.html`
  - **运营分析（按周期）** `ozon-analysis.html`
  - **产品分析（洞察）** `ozon-product-insights.html`
- 右侧内容区域沿用自运营的白底深色字（统一 theme.css），表格 DataTables + ECharts 图表。

---

## 2. 数据模型（Postgres / Supabase）

> 对齐“自运营”口径，**业务日期 day** 为准；多店铺时引入 `store_id`；对广告/来源引流做可选维度。

### 2.1 商品日指标表

```sql
CREATE TABLE IF NOT EXISTS public.ozon_daily_product_metrics (...);
```

### 2.2 新品首登表

```sql
CREATE TABLE IF NOT EXISTS public.ozon_first_seen (...);
```

### 2.3 订单明细表（可选）

```sql
CREATE TABLE IF NOT EXISTS public.ozon_order_items (...);
```

---

## 3. 数据导入（Ingest）与字段映射

- 支持 XLSX/CSV 上传；首行标题自动匹配。
- 幂等 upsert，导入完成后自动刷新新品表。

---

## 4. API 契约

- `GET /api/ozon/periods` → 周/月周期
- `GET /api/ozon/stats?...` → 明细 + KPI（支持仅新品）
- KPI 新品数：`new_product_count`

---

## 5. 前端页面与交互设计

### 5.1 数据明细

- 顶部筛选：店铺、日期范围、campaign、traffic\_source
- **新品筛选交互（对齐全托管）**：
  - KPI 卡片「本周期新品数」默认显示 `new_product_count`。
  - **点击 KPI 卡片 → 进入仅新品视图**（给接口加 `only_new=1`），并在该 KPI 卡片右上角显示 **“取消筛选”** 按钮（× 图标或文字）。
  - **取消筛选**：点击后移除 `only_new` 参数（或置为 0），恢复为完整数据明细，同时 KPI 卡片恢复默认态。
  - 明细表右上同时保留一个显式的 **“清除筛选”** 按钮，行为同上，便于从表格侧恢复。
- KPI 卡片：访客比、加购比、支付比、商品总数、有加购、有支付、**新品数（可点击/可取消筛选）**
- 表格（DataTables）：商品ID、日期、曝光、UV、PV、ATC、订单、买家、GMV、**新品标记**（is\_new）
- URL/状态管理建议：在浏览器查询串中写入 `only_new=1`，刷新/分享链接仍保留筛选态；取消筛选时移除该参数。

### 5.2 运营分析

- 粒度：周/月 + 周期选择
- 图表：转化漏斗、周期对比、Top10 访客比、Top10 转化率

### 5.3 产品分析

- 筛选：商品ID/标题、类目、价格区间、新品、日期
- 卡片：成长曲线、价格 vs 转化、新品窗口表现
- 对比：最多 4 商品对比
- 导出 CSV/XLSX

---

## 6. UI 规范

- 深色侧栏 + 白底内容；沿用统一 theme.css。
- KPI 卡片可点击；**新品 KPI 卡片具备两种状态**：
  1. 默认态：显示数值，点击后启用 `only_new=1` 并在卡片右上出现「取消筛选」。
  2. 选中过滤态：卡片高亮（加描边/背景），右上显示「取消筛选」按钮；点击按钮清除筛选（`only_new=0`）。
- 表格首列链接到 Ozon 商品页。
- 图表自适应；窗口 resize 时重绘。
- 可访问性：按钮应有 ARIA 标签（例如 aria-pressed 用于仅新品切换）。

---

## 7. 验收与校验

1. `first_seen_date` 永远为最早业务日
2. KPI 新品数 = 明细 `is_new=true` 数
3. 仅新品/清除筛选切换逻辑正确
4. 导入幂等

---

## 8. 性能与扩展

- 建立索引 `(store_id, day)`、`(store_id, product_id)`
- 支持分区或归档历史数据
- 可扩展维度表 `ozon_products_dim`

---

## 9. 开发清单（给 Codex）

**页面与样式**

-

**后端与接口**

-

**数据与口径**

-

**前端交互**

-

**验收用例（最少覆盖）**

-

---

## 10. 附录 A：SQL 片段汇总

**10.1 新品 KPI（本周期）**

```sql
SELECT COUNT(*) AS new_product_count
FROM public.ozon_first_seen
WHERE store_id = :store_id
  AND first_seen_date BETWEEN :start_date AND :end_date;
```

**10.2 明细（支持仅新品/清除筛选）**

```sql
WITH detail AS (
  SELECT m.store_id, m.product_id,
         SUM(m.impressions) AS impressions,
         SUM(m.sessions)    AS sessions,
         SUM(m.pageviews)   AS pageviews,
         SUM(m.add_to_cart_users) AS atc_users,
         SUM(m.add_to_cart_qty)   AS atc_qty,
         SUM(m.orders)      AS orders,
         SUM(m.buyers)      AS buyers,
         SUM(m.items_sold)  AS items_sold,
         SUM(m.revenue)     AS revenue
  FROM public.ozon_daily_product_metrics m
  WHERE m.store_id = :store_id
    AND m.day BETWEEN :start_date AND :end_date
    AND (:campaign IS NULL OR m.campaign = :campaign)
    AND (:traffic_source IS NULL OR m.traffic_source = :traffic_source)
  GROUP BY m.store_id, m.product_id
)
SELECT d.*, fs.first_seen_date,
       (fs.first_seen_date BETWEEN :start_date AND :end_date) AS is_new
FROM detail d
LEFT JOIN public.ozon_first_seen fs
  ON fs.store_id = d.store_id AND fs.product_id = d.product_id
WHERE (:only_new = 0 OR is_new = TRUE)
ORDER BY is_new DESC, first_seen_date NULLS LAST, product_id;
```

**10.3 首登回填/增量**（见第 2.2 节，复制即可）。

---

## 11. 附录 B：接口返回结构（示例）

```json
{
  "ok": true,
  "kpis": {
    "avg_visit_rate": 7.35,          
    "avg_atc_rate": 12.40,
    "avg_pay_rate": 18.10,
    "product_count": 123,
    "atc_product_count": 78,
    "pay_product_count": 45,
    "new_product_count": 9
  },
  "rows": [
    {
      "product_id": "123456",
      "impressions": 1000,
      "sessions": 70,
      "pageviews": 120,
      "atc_users": 10,
      "atc_qty": 12,
      "orders": 6,
      "buyers": 6,
      "items_sold": 8,
      "revenue": 199.00,
      "first_seen_date": "2025-08-10",
      "is_new": true
    }
  ]
}
```

> 以上为 v1.0 完整版；如需适配 Ozon 官方报表列名，请在 Ingest 层按第 3 章做字段映射与别名。

