# Ozon 报表解析与入库实现说明

`analytics_report_2025-08-15_22_11.xlsx` 是 Ozon 商家后台导出的典型报表，前 7 行是“Период/Товар/Категория/Цена...”等说明。
第 8 行为一级分组（Sales / Funnel / Orders & Fulfillment / ...），第 9 行为实际字段名，
第 10 行给出每个字段的俄文说明。不能简单把首行当表头，需要通过 **字段词典 → 结构识别 → 清洗入库** 的三层方案来稳定解析，完全依赖离线映射规则，无需在线翻译。

本文说明如何将这类报表解析并入库到规范化长表 `public.ozon_product_metrics_long`、常用指标宽表 `public.ozon_product_report_wide`，以及原始表 `public.ozon_raw_analytics`。

## 1. 列名映射

```ts
const norm = (s: string) => (s || "").toLowerCase().trim().replace(/[\s.:;\/\\-]+/g, "_");

const MAP: Record<string, string[]> = {
  // 维度
  day:                ["дата", "date", "day"],
  product_id:         ["sku", "артикул", "id_товара", "id", "товар_id"],
  product_title:      ["товары", "товар", "название_товара", "наименование", "product_name"],
  category_l1:        ["категория_1_уровня"],
  category_l2:        ["категория_2_уровня"],
  category_l3:        ["категория_3_уровня"],
  brand:              ["бренд"],
  model:              ["модель"],
  sales_scheme:       ["схема_продаж", "схема_продажи"],
  sku:                ["sku"],
  article:            ["артикул"],

  // ABC & 金额
  abc_by_amount:      ["abc-анализ_по_сумме_заказов"],
  abc_by_qty:         ["abc-анализ_по_количеству_заказов"],
  amount_ordered:     ["заказано_на_сумму"],
  amount_ordered_delta: ["заказано_на_сумму_динамика"],
  amount_share:       ["доля_в_общей_сумме_заказов"],
  amount_share_delta: ["доля_в_общей_сумме_заказов_динамика"],

  // 排名/曝光
  search_position_avg: ["позиция_в_поиске_и_каталоге"],
  search_position_delta: ["позиция_в_поиске_и_каталоге_динамика"],
  impressions_total:  ["показы_всего"],
  impressions_total_delta: ["показы_всего_динамика"],
  conv_impr_to_order: ["конверсия_из_показа_в_заказ"],
  conv_impr_to_order_delta: ["конверсия_из_показа_в_заказ_динамика"],

  impressions_search_catalog: ["показы_в_поиске_и_каталоге"],
  impressions_search_catalog_delta: ["показы_в_поиске_и_каталоге_динамика"],
  conv_sc_to_cart: ["конверсия_из_поиска_и_каталога_в_корзину"],
  conv_sc_to_cart_delta: ["конверсия_из_поиска_и_каталога_в_корзину_динамика"],
  add_to_cart_from_sc: ["добавления_из_поиска_и_каталога_в_корзину"],
  add_to_cart_from_sc_delta: ["добавления_из_поиска_и_каталога_в_корзину_динамика"],
  conv_sc_to_card: ["конверсия_из_поиска_и_каталога_в_карточку"],
  conv_sc_to_card_delta: ["конверсия_из_поиска_и_каталога_в_карточку_динамика"],

  // 卡片/加购/下单/履约
  product_card_visits: ["посещения_карточки_товара"],
  product_card_visits_delta: ["посещения_карточки_товара_динамика"],
  conv_card_to_cart: ["конверсия_из_карточки_в_корзину"],
  conv_card_to_cart_delta: ["конверсия_из_карточки_в_корзину_динамика"],
  add_to_cart_from_card: ["добавления_из_карточки_в_корзину"],
  add_to_cart_from_card_delta: ["добавления_из_карточки_в_корзину_динамика"],
  conv_overall_to_cart: ["конверсия_в_корзину_общая"],
  conv_overall_to_cart_delta: ["конверсия_в_корзину_общая_динамика"],
  add_to_cart_total: ["добавления_в_корзину_всего"],
  add_to_cart_total_delta: ["добавления_в_корзину_всего_динамика"],
  conv_cart_to_order: ["конверсия_из_корзины_в_заказ"],
  conv_cart_to_order_delta: ["конверсия_из_корзины_в_заказ_динамика"],

  items_ordered: ["заказано_товаров"],
  items_ordered_delta: ["заказано_товаров_динамика"],
  items_delivered: ["доставлено_товаров"],
  items_delivered_delta: ["доставлено_товаров_динамика"],
  conv_order_to_buyout: ["конверсия_из_заказа_в_выкуп"],
  conv_order_to_buyout_delta: ["конверсия_из_заказа_в_выкуп_динамика"],
  items_buyout: ["выкуплено_товаров"],
  items_buyout_delta: ["выкуплено_товаров_динамика"],

  items_cancel_by_cancel_date: ["отменено_товаров_(на_дату_отмены)"],
  items_cancel_by_cancel_date_delta: ["отменено_товаров_(на_дату_отмены)_динамика"],
  items_cancel_by_order_date: ["отменено_товаров_(на_дату_заказа)"],
  items_cancel_by_order_date_delta: ["отменено_товаров_(на_дату_заказа)_динамика"],
  items_return_by_return_date: ["возвращено_товаров_(на_дату_возврата)"],
  items_return_by_return_date_delta: ["возвращено_товаров_(на_дату_возврата)_динамика"],
  items_return_by_order_date: ["возвращено_товаров_(на_дату_заказа)"],
  items_return_by_order_date_delta: ["возвращено_товаров_(на_дату_заказа)_динамика"],

  avg_price: ["средняя_цена"],
  avg_price_delta: ["средняя_цена_динамика"],
  discount_from_your_price: ["скидка_от_вашей_цены"],
  discount_from_your_price_delta: ["скидка_от_вашей_цены_динамика"],
  price_index: ["индекс_цен"],
  promo_days: ["дней_в_акциях"],
  ad_spend_ratio: ["общая_дртр","общая_дрр","общая_дпрр","общая_д_rr"],
  ad_spend_ratio_delta: ["общая_дртр_динамика","общая_дрр_динамика"],
  promoted_days: ["дней_с_продвижением_трафареты"],
  oos_days_28d: ["дней_без_остатка"],
  ending_stock: ["остаток_на_конец_периода"],
  fbo_supply_advice: ["рекомендация_по_поставке_на_fbo"],
  fbo_supply_qty: ["сколько_товаров_поставить"],
  avg_delivery_days: ["среднее_время_доставки"],
  reviews_count: ["отзывы"],
  product_rating: ["рейтинг_товара"],

  // 识别说明行
  __label__:          ["товар:", "категория:", "цена:", "продавец:", "undefined"]
};

// 列名映射函数
function mapHeader(header: string): string | null {
  const h = norm(header);
  for (const [std, aliases] of Object.entries(MAP)) {
    if (aliases.some(a => h.includes(a))) return std;
  }
  return null;
}
```

## 2. 结构识别

在前 30 行内寻找真正的表头，并剔除“Категория / Товар / Цена”等说明行；如存在双层表头，则合并上下两行再进行映射。

```ts
export function detectHeaderRow(rows: any[][]): number {
  const MAX_SCAN = Math.min(rows.length, 30);
  let bestIdx = 0;
  let bestScore = 0;
  for (let i = 0; i < MAX_SCAN; i++) {
    const r = rows[i] ?? [];
    const nonEmpty = r.filter(v => String(v ?? "").trim() !== "").length;
    const numeric  = r.filter(v => typeof v === "number").length;
    const hits     = r.filter(v => mapHeader(String(v ?? ""))).length;
    if (nonEmpty >= 6 && numeric <= 2 && hits >= 3) {
      const score = hits * nonEmpty;
      if (score >= bestScore) {
        bestIdx = i;
        bestScore = score;
      }
    }
  }
  return bestIdx;
}

export function isLabelRow(cells: any[]): boolean {
  const first = String(cells?.[0] ?? "").toLowerCase().trim();
  if (MAP.__label__.some(k => first.includes(k))) return true;
  return cells.every(v => {
    const s = String(v ?? "").trim();
    return s === "" || s === "0" || s === "-" || s === "—";
  });
}

export function mergeHeaderRows(rows: any[][], headerRowIdx: number) {
  const header = rows[headerRowIdx] || [];
  const prevIdx = headerRowIdx - 1;
  if (prevIdx < 0) return header;
  const upper = rows[prevIdx] || [];
  const nonEmpty = upper.filter(v => String(v ?? "").trim() !== "").length;
  const numeric  = upper.filter(v => typeof v === "number").length;
  if (nonEmpty > 0 && numeric === 0 && !isLabelRow(upper)) {
    const merged: string[] = [];
    const len = Math.max(upper.length, header.length);
    for (let i = 0; i < len; i++) {
      const up  = String(upper[i]  || "").trim();
      const low = String(header[i] || "").trim();
      merged[i] = [up, low].filter(Boolean).join("_");
    }
    return merged;
  }
  return header;
}
```

表头行下方若存在字段说明，解析时会一并读取并写入 `public.ozon_metric_dictionary`，同时根据字段映射附带中文翻译，供前端调用。

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

- 规范化表：`public.ozon_product_report_wide`，主键 `(store_id, day, product_id)`。
- 原始表：`public.ozon_raw_analytics`，`raw_row` 存完整 JSON，`import_batch` 存文件名或哈希。
- 数值缺失写 `0`，日期或商品 ID 为空的行可以落入原始表但不入规范化表。
- 若报表没有 `Дата` 列，会从顶部 “`Период: 01.08.2025 – 15.08.2025`” 行提取结束日期作为 `day`。
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
