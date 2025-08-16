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

// 将俄文列名规范化为小写下划线形式
const norm = (s) => (s || "").toLowerCase().trim().replace(/[\s.:;/\\-]+/g, "_");

// 俄文/英文列名到英文字段的映射
const RU_HEADER_MAP = {
  day:                ["дата", "date", "day"],
  product_id:         ["sku", "артикул", "id_товара", "id", "товар_id"],
  product_title:      ["товары", "товар", "название_товара", "наименование", "product_name", "наименование_товара"],
  category_name:      ["категория", "категория_1_уровня", "категория_2_уровня", "категория_3_уровня"],
  search_exposure:    ["показы", "показы_всего", "impressions", "impr"],
  uv:                 ["сеансы", "визиты", "посещения", "sessions", "uv"],
  pv:                 ["просмотры", "просмотры_карточки", "pv"],
  add_to_cart_users:  ["пользователи,_добавившие_в_корзину", "добавления_в_корзину_(пользователи)"],
  add_to_cart_qty:    ["добавления_в_корзину", "кол_во_добавлений_в_корзину"],
  pay_orders:         ["заказы", "orders"],
  pay_items:          ["проданные_товары", "кол_во_товаров", "items_sold"],
  pay_buyers:         ["покупатели", "buyers"],
  __label__:          ["товар:", "категория:", "цена:", "продавец:", "undefined"]
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
  for (let i = 0; i < MAX_SCAN; i++) {
    const r = rows[i] || [];
    const nonEmpty = r.filter((v) => String(v ?? "").trim() !== "").length;
    const numeric = r.filter((v) => typeof v === "number").length;
    const hits = r.filter((v) => mapHeaderToStd(String(v ?? ""))).length;
    if (nonEmpty >= 4 && numeric <= 2 && hits >= 3) return i;
  }
  return 0;
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

function mergeHeaderRows(rows, idx) {
  const header = rows[idx] || [];
  const upper = rows[idx - 1] || [];
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
    else if (k === "product_id") rec.product_id = extractProductId(v);
    else if (k === "product_title") rec.product_title = v;
    else if (k === "category_name") rec.category_name = v;
    else rec[k] = parseVal(v);
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
    await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err);
        const f = files?.file?.[0];
        if (!f) return reject(new Error("缺少文件"));
        const p = f.path || f.filepath;
        try { fileBuffer = fs.readFileSync(p); } catch (e) { return reject(e); }
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
    const headerIdx = detectHeaderRow(rows);
    const mergedHeader = mergeHeaderRows(rows, headerIdx);
    const descRow = rows[headerIdx + 1] || [];
    const map = [];
    for (let i = 0; i < mergedHeader.length; i++) {
      map[i] = mapHeaderToStd(String(mergedHeader[i] || ""));
    }
    if (!map.includes("product_id") || !map.includes("product_title")) {
      return res.status(400).json({ ok: false, msg: "无法识别商品ID或商品名列" });
    }
    // 解析报告周期末尾日期
    let periodEnd = null;
    for (let i = 0; i < headerIdx; i++) {
      const first = String(rows[i]?.[0] || "").toLowerCase();
      const m = first.match(/период:\s*(\d{2}\.\d{2}\.\d{4})\s*–\s*(\d{2}\.\d{2}\.\d{4})/);
      if (m) {
        const [, , end] = m;
        const [d, mth, y] = end.split(".");
        periodEnd = `${y}-${mth}-${d}`;
        break;
      }
    }

    const dataRows = rows.slice(headerIdx + 2);
    const records = [];
    const rawRows = [];
    let minDay = null, maxDay = null;

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
      const row = {
        store_id,
        day: rec.day,
        product_id: rec.product_id,
        product_title: rec.product_title,
        category_name: rec.category_name || null,
        search_exposure: rec.search_exposure || 0,
        uv: rec.uv || 0,
        pv: rec.pv || 0,
        add_to_cart_users: rec.add_to_cart_users || 0,
        add_to_cart_qty: rec.add_to_cart_qty || 0,
        pay_items: rec.pay_items || 0,
        pay_orders: rec.pay_orders || 0,
        pay_buyers: rec.pay_buyers || 0,
      };
      records.push(row);
      const day = rec.day;
      if (day) {
        if (!minDay || day < minDay) minDay = day;
        if (!maxDay || day > maxDay) maxDay = day;
      }
    }

    if (rawRows.length) {
      await supabase.from("ozon_raw_analytics").insert(rawRows);
    }
    if (records.length) {
      await supabase
        .from("ozon_daily_product_metrics")
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
