# Independent-Site Analytics UI Architecture Plan

This document outlines how the new Canva-based design integrates with the existing analytics platform.

## Overview
- **Goal**: Display landing-page performance with charts, filters, and paginated tables based on real-time API data.
- **Scope**: Front-end UI, API contracts, data flow, and performance considerations.

## UI Modules
### Navigation
- Global header shows platform shortcuts (Amazon, TikTok Shop, Temu, Ozon, 独立站) and user menu.
- Sidebar for independent-site pages lists **运营分析**, **明细表**, **数据导入**, **系统配置** with filter bar only on the first two.

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
- `GET /api/independent/stats` → returns `{ ok, table, series, topList, kpis }`.
  - `kpis` aggregates average click-through rate, average conversion rate, counts of products with impressions/clicks/conversions, and new-product totals.
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

