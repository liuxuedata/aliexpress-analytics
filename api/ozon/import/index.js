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

const norm = (s) => (s || "").toLowerCase().trim().replace(/[ .:;/\\-]+/g, "_");

const RU_HEADER_MAP = {
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

function mapHeaderToStd(header) {
  const h = norm(header);
  for (const [std, aliases] of Object.entries(RU_HEADER_MAP)) {
    if (std === "__label__") continue;
    if (aliases.some((a) => h.includes(a))) return std;
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
    const numeric = r.filter((v) => typeof v === "number").length;
    const hits = r.filter((v) => mapHeaderToStd(String(v ?? ""))).length;
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
    if (k === "day" || k === "date") rec.day = v;
    else if (k === "product_id" || k === "sku" || k === "артикул")
      rec.product_id = extractProductId(v);
    else if (k === "product_title" || k === "товар" || k === "название товара")
      rec.product_title = v;
    else if (["category_l1","category_l2","category_l3","brand","model","sales_scheme","sku","article"].includes(k))
      rec[k] = v;
    else
      rec[k] = parseVal(v);
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
    const header = mergeHeaderRows(rows, headerRowIdx);
    const descRow = rows[headerRowIdx + 1] || [];
    const map = header.map((h) => mapHeaderToStd(String(h || "")));
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

    const records = [];
    const rawRows = [];
    let minDay = null, maxDay = null;

    const dictRows = [];
    for (let i = 0; i < map.length; i++) {
      const std = map[i];
      if (!std) continue;
      dictRows.push({
        std_field: std,
        ru_label: String(header[i] || ""),
        ru_desc: String(descRow[i] || ""),
        zh_desc: DESC_ZH[std] || null,
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
      if (!rec.day || !rec.product_id) continue;
      const full = { store_id, ...rec };
      records.push(full);
      const day = rec.day;
      if (day) {
        if (!minDay || day < minDay) minDay = day;
        if (!maxDay || day > maxDay) maxDay = day;
      }
    }

    if (rawRows.length) {
      await supabase.from("ozon_raw_analytics").insert(rawRows);
    }
    if (dictRows.length) {
      await supabase.from("ozon_metric_dictionary").upsert(dictRows, { onConflict: "std_field" });
    }
    if (records.length) {
      await supabase
        .from("ozon_product_report_wide")
        .upsert(records, { onConflict: "store_id,day,product_id" });
    }
    if (minDay && maxDay) {
      await supabase.rpc("refresh_ozon_first_seen", { start_date: minDay, end_date: maxDay });
    }
    return res.status(200).json({ ok: true, inserted: records.length, raw: rawRows.length });
  } catch (e) {
    return res.status(500).json({ ok: false, msg: e.message });
  }
};
