# Independent-Site Analytics UI Architecture Plan

This document outlines how the new Canva-based design integrates with the existing analytics platform.

## Overview
- **Goal**: Display landing-page performance with charts, filters, and paginated tables based on real-time API data.
- **Scope**: Front-end UI, API contracts, data flow, and performance considerations.

## UI Modules
### Navigation
- Global header includes a 速卖通 button with a dropdown for **全托管**, **自运营**, and **独立站**, followed by shortcuts to Amazon, TikTok Shop, Temu, and Ozon.
 - Sidebar for independent-site pages lists **运营分析**, **明细表**, **数据导入**, **系统配置** with filter bar only on the first two.
 - Full-managed and self-operated dashboards now share the same four-item sidebar: **运营分析**, **明细数据**, **数据导入**, **系统设置**。运营分析板块提供 **周/月对比**, **单品诊断**, **渠道分析**, **地区分析** 四个子标签，并附带 Top 销售/加购/访客 榜单。

### Data Charts
- Line and bar charts use ECharts.
- Fetch `/api/independent/stats` for time-series data.
- Use lazy rendering and `deferRender` for tables to improve initial load.

### Filters & Pagination
- Date pickers plus network/campaign dropdowns trigger data reloads.
- Device column remains optional via a toggle.
- Main table uses DataTables with client-side pagination (`pageLength: 20`).
- Server can support query parameters `site`, `from`, `to`, `network`, `campaign`, `device` for future server-side paging.

## API Interface
- `GET /api/independent/stats` → returns `{ ok, table, series, topList, kpis, kpis_prev }`.
  - `kpis` aggregates average click-through rate, average conversion rate, counts of products with impressions/clicks/conversions, and new-product totals.
  - `kpis_prev` mirrors the same fields for the previous period so the UI can display week-over-week comparisons.
- `POST /api/independent/ingest` → accepts CSV/XLSX uploads.
- Ensure consistent field names: `clicks`, `impr`, `cost`, `conversions`, `all_conv`, `conv_value`.

## Network & Data Flow
1. User selects filters → front end builds query string.
2. Browser requests API → backend reads database and aggregates.
3. Response populates charts and tables.
4. Column visibility changes trigger client-side reaggregation to keep rows minimal.

## Performance & Caching
- Enable HTTP caching with `ETag` for static assets.
- Consider CDN for `assets/` and third-party libraries.
- API layer may cache frequent queries (e.g., last 7 days) in Redis.

## Responsive Design
- Layout uses Flexbox; table wrapper adds horizontal scroll on narrow screens.
- Test across Chrome, Firefox, Edge, Safari, and mobile devices.

## Testing
- Manual: verify filters, sorting, pagination, and upload flow.
- Automated: hook `npm test` once test suite is added.

## Future Enhancements
- Server-side pagination for very large datasets.
- Additional product-analysis dashboards once mapping to SKU is available.
- Expand metrics (ROAS, CPA) according to business needs.

