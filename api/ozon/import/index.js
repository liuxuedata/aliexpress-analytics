const multiparty = require("multiparty");
const xlsx = require("xlsx");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

function supa() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

// Normalize header cells: lower-case, trim, collapse whitespace and symbols to underscores
const norm = (s) =>
  (s || "")
    .toLowerCase()
    .trim()
    .replace(/[\s.:;/\\-]+/g, "_");

const RU_HEADER_MAP = {
  // 维度
  day:                ["дата", "date", "day"],
  product_id:         ["sku", "id_товара", "id", "товар_id"],
  product_title:      ["товары", "товар", "название_товара", "наименование", "product_name"],
  category_l1:        ["категория_1_уровня"],
  category_l2:        ["категория_2_уровня"],
  category_l3:        ["категория_3_уровня"],
  brand:              ["бренд"],
  model:              ["модель"],
  sales_scheme:       ["схема_продаж", "схема_продажи"],
  vendor_code:        ["артикул"],

  // ABC & 金额
  abc_by_amount:      ["abc-анализ_по_сумме_заказов"],
  abc_by_qty:         ["abc-анализ_по_количеству_заказов"],
  amount_ordered:     ["заказано_на_сумму"],
  amount_ordered_trend: ["заказано_на_сумму_динамика"],
  amount_share:       ["доля_в_общей_сумме_заказов"],
  amount_share_trend: ["доля_в_общей_сумме_заказов_динамика"],

  // 排名/曝光
  search_position_avg: ["позиция_в_поиске_и_каталоге"],
  search_position_trend: ["позиция_в_поиске_и_каталоге_динамика"],
  impressions_total:  ["показы_всего"],
  impressions_total_trend: ["показы_всего_динамика"],
  conv_impr_to_order: ["конверсия_из_показа_в_заказ"],
  conv_impr_to_order_trend: ["конверсия_из_показа_в_заказ_динамика"],

  impressions_search_catalog: ["показы_в_поиске_и_каталоге"],
  impressions_search_catalog_trend: ["показы_в_поиске_и_каталоге_динамика"],
  conv_sc_to_cart: ["конверсия_из_поиска_и_каталога_в_корзину"],
  conv_sc_to_cart_trend: ["конверсия_из_поиска_и_каталога_в_корзину_динамика"],
  add_to_cart_from_sc: ["добавления_из_поиска_и_каталога_в_корзину"],
  add_to_cart_from_sc_trend: ["добавления_из_поиска_и_каталога_в_корзину_динамика"],
  conv_sc_to_card: ["конверсия_из_поиска_и_каталога_в_карточку"],
  conv_sc_to_card_trend: ["конверсия_из_поиска_и_каталога_в_карточку_динамика"],

  // 卡片/加购/下单/履约
  product_card_visits: ["посещения_карточки_товара"],
  product_card_visits_trend: ["посещения_карточки_товара_динамика"],
  conv_card_to_cart: ["конверсия_из_карточки_в_корзину"],
  conv_card_to_cart_trend: ["конверсия_из_карточки_в_корзину_динамика"],
  add_to_cart_from_card: ["добавления_из_карточки_в_корзину"],
  add_to_cart_from_card_trend: ["добавления_из_карточки_в_корзину_динамика"],
  conv_overall_to_cart: ["конверсия_в_корзину_общая"],
  conv_overall_to_cart_trend: ["конверсия_в_корзину_общая_динамика"],
  add_to_cart_total: ["добавления_в_корзину_всего"],
  add_to_cart_total_trend: ["добавления_в_корзину_всего_динамика"],
  conv_cart_to_order: ["конверсия_из_корзины_в_заказ"],
  conv_cart_to_order_trend: ["конверсия_из_корзины_в_заказ_динамика"],

  items_ordered: ["заказано_товаров"],
  items_ordered_trend: ["заказано_товаров_динамика"],
  items_delivered: ["доставлено_товаров"],
  items_delivered_trend: ["доставлено_товаров_динамика"],
  conv_order_to_buyout: ["конверсия_из_заказа_в_выкуп"],
  conv_order_to_buyout_trend: ["конверсия_из_заказа_в_выкуп_динамика"],
  items_buyout: ["выкуплено_товаров"],
  items_buyout_trend: ["выкуплено_товаров_динамика"],

  items_cancel_by_cancel_date: ["отменено_товаров_(на_дату_отмены)"],
  items_cancel_by_cancel_date_trend: ["отменено_товаров_(на_дату_отмены)_динамика"],
  items_cancel_by_order_date: ["отменено_товаров_(на_дату_заказа)"],
  items_cancel_by_order_date_trend: ["отменено_товаров_(на_дату_заказа)_динамика"],
  items_return_by_return_date: ["возвращено_товаров_(на_дату_возврата)"],
  items_return_by_return_date_trend: ["возвращено_товаров_(на_дату_возврата)_динамика"],
  items_return_by_order_date: ["возвращено_товаров_(на_дату_заказа)"],
  items_return_by_order_date_trend: ["возвращено_товаров_(на_дату_заказа)_динамика"],

  avg_price: ["средняя_цена"],
  avg_price_trend: ["средняя_цена_динамика"],
  discount_from_your_price: ["скидка_от_вашей_цены"],
  discount_from_your_price_trend: ["скидка_от_вашей_цены_динамика"],
  price_index: ["индекс_цен"],
  promo_days: ["дней_в_акциях"],
  ad_spend_ratio: ["общая_дртр","общая_дрр","общая_дпрр","общая_д_rr"],
  ad_spend_ratio_trend: ["общая_дртр_динамика","общая_дрр_динамика"],
  promoted_days: ["дней_с_продвижением_трафареты"],
  oos_days_28d: ["дней_без_остатка"],
  ending_stock: ["остаток_на_конец_периода"],
  fbo_supply_advice: ["рекомендация_по_поставке_на_fbo"],
  fbo_supply_qty: ["сколько_товаров_поставить"],
  avg_delivery_days: ["среднее_время_доставки"],
  reviews_count: ["отзывы"],
  product_rating: ["рейтинг_товара"],

  // 识别说明行
  __label__:          ["товар:", "категория:", "цена:", "продавец:", "undefined", "итого"]
};

const DESC_ZH = {
  day: "日期",
  product_id: "商品ID",
  product_title: "商品名称",
  impressions: "曝光量",
  sessions: "访客数",
  pageviews: "浏览量",
  add_to_cart_users: "加购人数",
  add_to_cart_qty: "加购件数",
  orders: "订单数",
  buyers: "买家数",
  items_sold: "支付件数",
  revenue: "销售额",
  brand: "品牌",
  model: "型号",
  category_l1: "一级类目",
  category_l2: "二级类目",
  category_l3: "三级类目",
  sales_scheme: "销售模式",
};

const DESC_RU_ZH = {
  abc_by_amount: "按订单金额对商品做ABC分类：A≈80%、B≈15%、C≈5%",
  abc_by_qty: "按订单数量做ABC分类：A≈80%、B≈15%、C≈5%",
  amount_ordered: "订单总金额（含取消/退货，按卖家价格口径）",
  amount_ordered_trend: "与上期相比的变化",
  amount_share: "本商品订单金额/总订单金额",
  amount_share_trend: "与上期相比的变化",
  search_position_avg: "搜索/目录平均排名（0 表示当期无曝光）",
  search_position_trend: "与上期相比的变化",
  impressions_total: "买家看到商品的次数（含所有页面+卡片访问）",
  impressions_total_trend: "与上期相比的变化",
  conv_impr_to_order: "下单数/曝光数",
  conv_impr_to_order_trend: "与上期相比的变化",
  impressions_search_catalog: "搜索和目录曝光次数",
  impressions_search_catalog_trend: "与上期相比的变化",
  conv_sc_to_cart: "搜索/目录加购转化率",
  conv_sc_to_cart_trend: "与上期相比的变化",
  add_to_cart_from_sc: "搜索/目录加购次数",
  add_to_cart_from_sc_trend: "与上期相比的变化",
  conv_sc_to_card: "搜索/目录到卡片转化率",
  conv_sc_to_card_trend: "与上期相比的变化",
  product_card_visits: "商品卡片访问次数",
  product_card_visits_trend: "与上期相比的变化",
  conv_card_to_cart: "卡片到加购转化率",
  conv_card_to_cart_trend: "与上期相比的变化",
  add_to_cart_from_card: "卡片加购次数",
  add_to_cart_from_card_trend: "与上期相比的变化",
  conv_overall_to_cart: "整体加购转化率",
  conv_overall_to_cart_trend: "与上期相比的变化",
  add_to_cart_total: "总加购次数",
  add_to_cart_total_trend: "与上期相比的变化",
  conv_cart_to_order: "加购到下单转化率",
  conv_cart_to_order_trend: "与上期相比的变化",
  items_ordered: "下单件数",
  items_ordered_trend: "与上期相比的变化",
  items_delivered: "配送件数",
  items_delivered_trend: "与上期相比的变化",
  conv_order_to_buyout: "下单到购买转化率",
  conv_order_to_buyout_trend: "与上期相比的变化",
  items_buyout: "购买件数",
  items_buyout_trend: "与上期相比的变化",
  items_cancel_by_cancel_date: "按取消日期统计的取消件数",
  items_cancel_by_cancel_date_trend: "与上期相比的变化",
  items_cancel_by_order_date: "按下单日期统计的取消件数",
  items_cancel_by_order_date_trend: "与上期相比的变化",
  items_return_by_return_date: "按退货日期统计的退货件数",
  items_return_by_return_date_trend: "与上期相比的变化",
  items_return_by_order_date: "按下单日期统计的退货件数",
  items_return_by_order_date_trend: "与上期相比的变化",
  avg_price: "平均成交价",
  avg_price_trend: "与上期相比的变化",
  discount_from_your_price: "折扣率(相对于卖家价格)",
  discount_from_your_price_trend: "与上期相比的变化",
  price_index: "价格指数",
  promo_days: "参加促销天数",
  ad_spend_ratio: "广告花费占比",
  ad_spend_ratio_trend: "与上期相比的变化",
  promoted_days: "付费推广天数",
  oos_days_28d: "28天缺货天数",
  ending_stock: "期末库存",
  fbo_supply_advice: "FBO 补货建议",
  fbo_supply_qty: "建议补货数量",
  avg_delivery_days: "平均配送天数",
  reviews_count: "评论数",
  product_rating: "商品评分",
};

const DIMS = new Set([
  "day",
  "product_id",
  "product_title",
  "category_l1",
  "category_l2",
  "category_l3",
  "brand",
  "model",
  "sales_scheme",
  "sku",
  "vendor_code",
]);

const WIDE_FIELDS = new Set([
  "impressions_total",
  "impressions_total_trend",
  "impressions_search_catalog",
  "impressions_search_catalog_trend",
  "product_card_visits",
  "product_card_visits_trend",
  "add_to_cart_total",
  "add_to_cart_total_trend",
  "conv_impr_to_order",
  "conv_impr_to_order_trend",
  "conv_sc_to_cart",
  "conv_sc_to_cart_trend",
  "conv_card_to_cart",
  "conv_card_to_cart_trend",
  "conv_cart_to_order",
  "conv_cart_to_order_trend",
  "items_ordered",
  "items_ordered_trend",
  "items_delivered",
  "items_delivered_trend",
  "items_buyout",
  "items_buyout_trend",
  "conv_order_to_buyout",
  "conv_order_to_buyout_trend",
  "avg_price",
  "avg_price_trend",
  "discount_from_your_price",
  "discount_from_your_price_trend",
  "price_index",
  "promo_days",
  "ad_spend_ratio",
  "ad_spend_ratio_trend",
  "promoted_days",
  "oos_days_28d",
  "ending_stock",
  "fbo_supply_advice",
  "fbo_supply_qty",
  "avg_delivery_days",
  "reviews_count",
  "product_rating",
]);

function mapHeaderToStd(header) {
  const h = norm(header);
  for (const [std, aliases] of Object.entries(RU_HEADER_MAP)) {
    if (std === "__label__") continue;
    if (aliases.some((a) => h.startsWith(a))) return std;
  }
  return null;
}

function detectHeaderRow(rows) {
  const MAX_SCAN = Math.min(rows.length, 30);
  let bestIdx = 0;
  let bestScore = 0;
  for (let i = 0; i < MAX_SCAN; i++) {
    const r = rows[i] || [];
    const nonEmpty = r.filter((v) => String(v ?? "").trim() !== "").length;
    const hits = r.filter((v) => mapHeaderToStd(String(v ?? ""))).length;
    const totalLen = r.reduce((sum, v) => sum + String(v ?? "").length, 0);
    const avgLen = nonEmpty ? totalLen / nonEmpty : 0;
    if (nonEmpty >= 6 && hits >= 3 && avgLen < 40) {
      const score = hits * 100 + nonEmpty - avgLen; // penalize long description rows
      if (score > bestScore) {
        bestIdx = i;
        bestScore = score;
      }
    }
  }
  return bestIdx;
}

function isLabelRow(cells) {
  const first = String(cells?.[0] ?? "").toLowerCase().trim();
  const hasLabel = RU_HEADER_MAP.__label__.some((k) => first.includes(k));
  if (hasLabel) return true;
  return cells.every((v) => {
    const s = String(v ?? "").trim();
    return s === "" || s === "0" || s === "-" || s === "—";
  });
}

function mergeHeaderRows(rows, headerRowIdx) {
  const header = rows[headerRowIdx] || [];
  const prevIdx = headerRowIdx - 1;
  if (prevIdx < 0) return header;
  const upper = rows[prevIdx] || [];
  const nonEmpty = upper.filter((v) => String(v ?? "").trim() !== "").length;
  const numeric = upper.filter((v) => typeof v === "number").length;
  if (nonEmpty > 0 && numeric === 0 && !isLabelRow(upper)) {
    const merged = [];
    const len = Math.max(upper.length, header.length);
    for (let i = 0; i < len; i++) {
      const up = String(upper[i] || "").trim();
      const low = String(header[i] || "").trim();
      merged[i] = [up, low].filter(Boolean).join("_");
    }
    return merged;
  }
  return header;
}

function extractProductId(v) {
  if (v == null) return null;
  const s = String(v);
  const m = s.match(/(\d{6,})/);
  return m ? m[1] : null;
}

function parseVal(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s+/g, "").replace(",", ".");
  if (s === "") return null;
  if (/^-?\d+(\.\d+)?%$/.test(s)) return parseFloat(s.replace("%", "")) / 100;
  const num = Number(s);
  return Number.isNaN(num) ? v : num;
}

function rowToRecord(stdRow) {
  const rec = {};
  for (const [k, v] of Object.entries(stdRow)) {
    if (k === "day" || k === "date") {
      rec.day = v;
    } else if (k === "product_id") {
      rec.product_id = extractProductId(v);
      rec.sku = v;
    } else if (k === "sku") {
      rec.sku = v;
    } else if (k === "vendor_code") {
      rec.vendor_code = v;
    } else if (k === "product_title" || k === "товар" || k === "название товара") {
      rec.product_title = v;
    } else if (["category_l1","category_l2","category_l3","brand","model","sales_scheme","sku","vendor_code"].includes(k)) {
      rec[k] = v;
    } else {
      rec[k] = parseVal(v);
    }
  }
  return rec;
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, msg: "ozon import" });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, msg: "Only POST" });
  }
  const supabase = supa();
  let fileBuffer, originalName, store_id;
  try {
    const form = new multiparty.Form({ uploadDir: "/tmp" });
    const parsed = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err);
        const f = files?.file?.[0];
        if (!f) return reject(new Error("缺少文件"));
        const p = f.path || f.filepath;
        try {
          fileBuffer = fs.readFileSync(p);
        } catch (e) {
          return reject(e);
        }
        originalName = f.originalFilename || f.filename || f.name || "upload.xlsx";
        store_id = fields?.store_id?.[0] || null;
        resolve(true);
      });
    });
  } catch (e) {
    return res.status(400).json({ ok: false, msg: e.message });
  }
  try {
    const wb = xlsx.read(fileBuffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, raw: false });
    const headerRowIdx = detectHeaderRow(rows);
    // Row preceding the header contains high-level section labels (Sales/Funnel/...)
    const sectionRow = rows[headerRowIdx - 1] || [];
    const header = rows[headerRowIdx] || [];
    const merged = mergeHeaderRows(rows, headerRowIdx);
    // The row after header stores field descriptions
    const descRow = rows[headerRowIdx + 1] || [];

    // Build header mapping; if a column header is "Динамика",
    // inherit the metric key from the previous column and append `_trend`.
    const map = [];
    for (let i = 0; i < merged.length; i++) {
      let key = mapHeaderToStd(String(merged[i] || ""));
      if (!key && norm(String(header[i] || "")) === "динамика" && i > 0) {
        const prev = map[i - 1];
        if (prev) key = `${prev}_trend`;
      }
      map[i] = key;
    }

    if (!map.includes("product_id") || !map.includes("product_title")) {
      return res.status(400).json({ ok: false, msg: "无法识别商品ID或商品名列" });
    }

    const dataRows = rows.slice(headerRowIdx + 2);

    let periodEnd = null;
    for (let i = 0; i < headerRowIdx; i++) {
      const first = String(rows[i]?.[0] || "").toLowerCase();
      const m = first.match(/период:\s*(\d{2}\.\d{2}\.\d{4})\s*–\s*(\d{2}\.\d{2}\.\d{4})/);
      if (m) {
        const [_, , end] = m;
        const [d, mth, y] = end.split(".");
        periodEnd = `${y}-${mth}-${d}`;
        break;
      }
    }

    const wideRecords = [];
    const longRecords = [];
    const rawRows = [];
    let minDay = null, maxDay = null;

    const catalogRows = [];
    for (let i = 0; i < map.length; i++) {
      const std = map[i];
      if (!std) continue;
      let ruLabel = String(header[i] || "").trim();
      if (std.endsWith("_trend") && header[i - 1]) {
        ruLabel = String(header[i - 1] || "").trim();
      }
      catalogRows.push({
        metric_key: std,
        section: String(sectionRow[i] || "General") || "General",
        subsection: String(sectionRow[i] || "General") || "General",
        ru_label: ruLabel,
        en_label: std,
        zh_label: DESC_ZH[std] || null,
        description_ru: String(descRow[i] || ""),
        description_zh: DESC_RU_ZH[std] || null,
        value_type: "number",
        unit: null,
        is_trend: std.endsWith("_trend"),
        base_metric_key: std.endsWith("_trend") ? std.replace(/_trend$/, "") : null,
      });
    }

    for (const r of dataRows) {
      if (isLabelRow(r)) continue;
      const obj = {};
      for (let i = 0; i < map.length; i++) {
        const key = map[i];
        if (!key) continue;
        obj[key] = r[i];
      }
      const rec = rowToRecord(obj);
      if (!rec.day && periodEnd) rec.day = periodEnd;
      rawRows.push({ store_id, raw_row: obj, import_batch: originalName });
      if (!rec.day || !rec.product_id) {
        console.warn("skip row", obj);
        continue;
      }
      const baseDim = {
        store_id,
        day: rec.day,
        product_id: rec.product_id,
        product_title: rec.product_title,
        category_l1: rec.category_l1,
        category_l2: rec.category_l2,
        category_l3: rec.category_l3,
        brand: rec.brand,
        model: rec.model,
        sales_scheme: rec.sales_scheme,
        sku: rec.sku,
        vendor_code: rec.vendor_code,
      };
      const wide = { ...baseDim };
      for (const f of WIDE_FIELDS) {
        if (rec[f] !== undefined) wide[f] = rec[f];
      }
      wideRecords.push(wide);
      for (const [k, v] of Object.entries(rec)) {
        if (DIMS.has(k)) continue;
        const entry = { ...baseDim, metric_key: k };
        if (typeof v === "number") entry.value_num = v;
        else entry.value_text = v == null ? null : String(v);
        longRecords.push(entry);
      }
      const day = rec.day;
      if (day) {
        if (!minDay || day < minDay) minDay = day;
        if (!maxDay || day > maxDay) maxDay = day;
      }
    }

    if (rawRows.length) {
      await supabase.from("ozon_raw_analytics").insert(rawRows);
    }
    if (catalogRows.length) {
      await supabase.from("ozon_metric_catalog").upsert(catalogRows, { onConflict: "metric_key" });
    }
    if (longRecords.length) {
      await supabase
        .from("ozon_product_metrics_long")
        .upsert(longRecords, { onConflict: "store_id,day,product_id,metric_key" });
    }
    if (wideRecords.length) {
      await supabase
        .from("ozon_product_report_wide")
        .upsert(wideRecords, { onConflict: "store_id,day,product_id" });
    }
    if (minDay && maxDay) {
      await supabase.rpc("refresh_ozon_first_seen", { start_date: minDay, end_date: maxDay });
    }
    return res.status(200).json({ ok: true, inserted: wideRecords.length, raw: rawRows.length });
  } catch (e) {
    return res.status(500).json({ ok: false, msg: e.message });
  }
};
