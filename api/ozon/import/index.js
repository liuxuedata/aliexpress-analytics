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
  campaign:           ["кампания", "campaign"],
  traffic_source:     ["источник_трафика", "traffic_source"],
  __label__:          [
    "товар:",
    "категория:",
    "цена:",
    "продавец:",
    "период:",
    "схема продажи:",
    "схема продаж:",
    "итого",
    "среднее",
    "undefined",
  ],
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
  scheme: "销售模式",
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

function rowToRecord(stdRow) {
  const n = (x) => (Number.isFinite(+x) ? +x : 0);
  return {
    day: stdRow.day || stdRow.date || null,
    product_id: extractProductId(stdRow.product_id || stdRow.sku || stdRow["артикул"]),
    product_title: stdRow.product_title || stdRow["товар"] || stdRow["название товара"],
    impressions: n(stdRow.impressions),
    sessions: n(stdRow.sessions),
    pageviews: n(stdRow.pageviews),
    add_to_cart_users: n(stdRow.add_to_cart_users),
    add_to_cart_qty: n(stdRow.add_to_cart_qty),
    orders: n(stdRow.orders),
    buyers: n(stdRow.buyers),
    items_sold: n(stdRow.items_sold),
    revenue: +stdRow.revenue || 0,
    brand: stdRow.brand || stdRow["бренд"] || null,
    model: stdRow.model || stdRow["модель"] || null,
    category_l1: stdRow.category_l1 || null,
    category_l2: stdRow.category_l2 || null,
    category_l3: stdRow.category_l3 || null,
    scheme: stdRow.scheme || null,
  };
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
      const full = { store_id, campaign: obj.campaign || null, traffic_source: obj.traffic_source || null, ...rec };
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
        .from("ozon_daily_product_metrics")
        .upsert(records, { onConflict: "store_id,product_id,day,campaign,traffic_source" });
    }
    if (minDay && maxDay) {
      await supabase.rpc("refresh_ozon_first_seen", { start_date: minDay, end_date: maxDay });
    }
    return res.status(200).json({ ok: true, inserted: records.length, raw: rawRows.length });
  } catch (e) {
    return res.status(500).json({ ok: false, msg: e.message });
  }
};
