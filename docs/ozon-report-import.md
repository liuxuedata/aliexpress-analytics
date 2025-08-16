# Ozon 报表解析与入库实现说明

本文描述如何将含俄文列名、带说明/分组标题行的 Ozon 报表（xlsx/csv）解析并入库到标准化表 `public.ozon_daily_product_metrics` 与原始表 `public.ozon_raw_analytics`。

## 1. 列名映射

```ts
const norm = (s: string) =>
  (s || "").toLowerCase().trim().replace(/[ .:;/\\-]+/g, "_");

export const RU_HEADER_MAP: Record<string, string[]> = {
  day:                ["дата", "date", "day"],
  product_id:         ["sku", "артикул", "id_товара", "id", "товар_id"],
  product_title:      ["товар", "название_товара", "наименование", "product_name", "наименование_товара"],
  impressions:        ["показы", "показы_товара", "impressions", "impr"],
  sessions:           ["сеансы", "визиты", "посещения", "sessions", "uv"],
  pageviews:          ["просмотры", "просмотры_карточки", "pv"],
  add_to_cart_users:  ["пользователи,_добавившие_в_корзину","добавления_в_корзину_(пользователи)","add_to_cart_users"],
  add_to_cart_qty:    ["добавления_в_корзину","кол_во_добавлений_в_корзину","add_to_cart_qty"],
  orders:             ["заказы","orders"],
  buyers:             ["покупатели","buyers"],
  items_sold:         ["проданные_товары","кол_во_товаров","items_sold"],
  revenue:            ["выручка","оборот","gmv","sales"],
  brand:              ["бренд","brand"],
  model:              ["модель","model"],
  category_l1:        ["категория_1_уровня"],
  category_l2:        ["категория_2_уровня"],
  category_l3:        ["категория_3_уровня"],
  scheme:             ["схема_продаж","схема_продажи","схема_продаж_fbo_fbs"],
  __label__:          ["товар:", "категория:", "цена:", "продавец:", "undefined"],
};

export function mapHeaderToStd(header: string): string | null {
  const h = norm(header);
  for (const [std, aliases] of Object.entries(RU_HEADER_MAP)) {
    if (std === "__label__") continue;
    if (aliases.some(a => h.includes(a))) return std;
  }
  return null;
}
```

## 2. 结构识别

```ts
export function detectHeaderRow(rows: any[][]): number {
  const MAX_SCAN = Math.min(rows.length, 30);
  for (let i = 0; i < MAX_SCAN; i++) {
    const r = rows[i] ?? [];
    const nonEmpty = r.filter(v => String(v ?? "").trim() !== "").length;
    const numeric  = r.filter(v => typeof v === "number").length;
    const hits     = r.filter(v => mapHeaderToStd(String(v ?? ""))).length;
    if (nonEmpty >= 6 && numeric <= 2 && hits >= 3) return i;
  }
  return 0;
}

export function isLabelRow(cells: any[]): boolean {
  const first = String(cells?.[0] ?? "").toLowerCase().trim();
  const onlyFew = cells.filter(v => String(v ?? "").trim() !== "").length <= 2;
  const onlyZeroDash = cells.every(v => {
    const s = String(v ?? "").trim();
    return s === "" || s === "0" || s === "-" || s === "—";
  });
  const hasLabel = RU_HEADER_MAP.__label__.some(k => first.includes(k));
  return (onlyFew && hasLabel) || onlyZeroDash;
}
```

## 3. 清洗与入库

```ts
export function extractProductId(v: any): string | null {
  if (v == null) return null;
  const s = String(v);
  const m = s.match(/(\d{6,})/);
  return m ? m[1] : null;
}

export function rowToRecord(stdRow: Record<string, any>) {
  const n = (x: any) => Number.isFinite(+x) ? +x : 0;
  return {
    day: stdRow.day ?? stdRow.date ?? null,
    product_id: extractProductId(stdRow.product_id ?? stdRow.sku ?? stdRow["артикул"]),
    product_title: stdRow.product_title ?? stdRow["товар"] ?? stdRow["название товара"],
    impressions:       n(stdRow.impressions),
    sessions:          n(stdRow.sessions),
    pageviews:         n(stdRow.pageviews),
    add_to_cart_users: n(stdRow.add_to_cart_users),
    add_to_cart_qty:   n(stdRow.add_to_cart_qty),
    orders:            n(stdRow.orders),
    buyers:            n(stdRow.buyers),
    items_sold:        n(stdRow.items_sold),
    revenue:           +stdRow.revenue || 0,
    brand:       stdRow.brand ?? stdRow["бренд"] ?? null,
    model:       stdRow.model ?? stdRow["модель"] ?? null,
    category_l1: stdRow.category_l1 ?? null,
    category_l2: stdRow.category_l2 ?? null,
    category_l3: stdRow.category_l3 ?? null,
    scheme:      stdRow.scheme ?? null,
  };
}
```

- 规范化表：`public.ozon_daily_product_metrics`，主键 `(store_id, product_id, day, campaign, traffic_source)`。
- 原始表：`public.ozon_raw_analytics`，`raw_row` 存完整 JSON，`import_batch` 存文件名或哈希。
- 数值缺失写 `0`，日期或商品 ID 为空的行可以落入原始表但不入规范化表。
- 导入后调用 `select public.refresh_ozon_first_seen(:start_date, :end_date);` 维护新品首登。

## 4. 前端要点

- 产品名列 `<a target="_blank" rel="noopener" href="https://ozon.ru/product/{product_id}">{product_title || product_id}</a>`。
- KPI「本周期新品数」点击后追加 `only_new=1` 参数并展示筛选按钮，清除筛选后恢复全量。

## 5. 验收清单

- 能识别说明/标题行并找到正确表头。
- 映射至少命中 `day`、`product_id`、`product_title`、`impressions`、`sessions`、`add_to_cart_users`、`buyers`。
- `product_id` 可从 URL 中提取。
- 正确写入规范化表与原始表，前端商品名可跳转。
- `refresh_ozon_first_seen` 正常执行，新品数与筛选一致。
