// /api/ingest/index.js
const multiparty = require("multiparty");
const { createClient } = require("@supabase/supabase-js");
const xlsx = require("xlsx");

// ------- Supabase client -------
function supa() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase 环境变量缺失：请设置 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

// ------- Helpers -------
function toNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).toString().replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function pad2(n) { return n < 10 ? "0" + n : "" + n; }

function excelSerialToDate(serial) {
  // Excel 1900 system
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms);
}

function normalizeDate(value) {
  // return { date: Date, y, m, d, str: 'YYYY-MM-DD' }
  let d;
  if (typeof value === "number" && value > 40000 && value < 80000) {
    d = excelSerialToDate(value);
  } else if (typeof value === "string") {
    const s = value.trim();
    if (/^\d{8}$/.test(s)) { // yyyymmdd
      const y = Number(s.slice(0, 4));
      const m = Number(s.slice(4, 6));
      const dd = Number(s.slice(6, 8));
      d = new Date(Date.UTC(y, m - 1, dd));
    } else {
      d = new Date(s);
    }
  } else if (value instanceof Date) {
    d = value;
  }
  if (!d || isNaN(d.getTime())) throw new Error(`无法解析统计日期: ${value}`);

  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const dd = d.getUTCDate();
  const str = `${y}-${pad2(m)}-${pad2(dd)}`;
  return { date: d, y, m, d: dd, str };
}

function isMonthEnd(y, m, d) {
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 -> last day of month
  return d === last;
}

function dayOfWeekUTC(y, m, d) {
  // 0=Sunday ... 6=Saturday
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function isWeekEnd(y, m, d) {
  return dayOfWeekUTC(y, m, d) === 0; // Sunday
}

function detectType(y, m, d, rowCount) {
  const me = isMonthEnd(y, m, d);
  const we = isWeekEnd(y, m, d);
  if (me && we) return "week";     // 两者都命中时优先按周
  if (me) return "month";
  if (we) return "week";
  // 兜底：根据行数猜测
  return rowCount < 300 ? "week" : "month";
}

function findIndexBy(header, names) {
  const lower = header.map(h => String(h || "").trim().toLowerCase());
  for (const name of names) {
    const i = lower.indexOf(name.toLowerCase());
    if (i > -1) return i;
  }
  return -1;
}

// 允许写入的列（白名单）——注意没有 product_link
const ALLOWED_FIELDS = new Set([
  "period_type","period_end","product_id",
  "search_exposure","uv","pv",
  "add_to_cart_users","add_to_cart_qty",
  "pay_items","pay_orders","pay_buyers"
]);

function whitelistPayload(arr) {
  return arr.map(obj => Object.fromEntries(
    Object.entries(obj).filter(([k]) => ALLOWED_FIELDS.has(k))
  ));
}

// ------- API Handler -------
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: false, msg: "Only POST" });
  }

  const supabase = supa();
  let step = "start";

  try {
    // ---- parse multipart ----
    step = "parse-form";
    const fileBuffer = await new Promise((resolve, reject) => {
      const form = new multiparty.Form();
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err);
        if (!files || !files.file || !files.file[0]) {
          return reject(new Error("未收到文件：请检查 FormData.append('file', file)"));
        }
        const fs = require("fs");
        const p = files.file[0].path;
        const buf = fs.readFileSync(p);
        resolve(buf);
      });
    });

    // ---- read excel ----
    step = "read-xlsx";
    const wb = xlsx.read(fileBuffer, { type: "buffer" });
    const ws =
      wb.Sheets["汇总指标"] ||
      wb.Sheets["商品排行"] ||
      wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new Error("Excel 为空或找不到工作表");
    const arr = xlsx.utils.sheet_to_json(ws, { header: 1, raw: true });
    if (!arr || arr.length < 2) throw new Error("Excel 无有效数据");

    const header = arr[0];
    const rows = arr.slice(1).filter(r => Array.isArray(r) && r.length);

    // ---- 取统计日期（默认取首行某列），可按你表格实际列位调整 ----
    step = "parse-date";
    // 常见列名：统计日期、日期、数据日期
    const dateCol = findIndexBy(header, ["统计日期", "日期", "数据日期"]);
    const rawDate = dateCol > -1 ? rows[0][dateCol] : rows[0][1];
    const { y, m, d, str: dateStr } = normalizeDate(rawDate);

    // ---- 强校验：仅允许周日或月末（不需要时可注释掉）----
    if (!(isWeekEnd(y, m, d) || isMonthEnd(y, m, d))) {
      throw new Error(`统计日期必须是周日或月底：检测到 ${dateStr}`);
    }

    // ---- 周/月类型检测 ----
    const periodType = detectType(y, m, d, rows.length);

    // ---- 列索引（根据常见中文别名做鲁棒映射）----
    step = "map-columns";
    const I = {
      productId: findIndexBy(header, ["商品id", "商品ID", "product_id", "id"]),
      exposure:  findIndexBy(header, ["搜索曝光量", "曝光量", "search_exposure"]),
      uv:        findIndexBy(header, ["访客数", "uv", "访客"]),
      pv:        findIndexBy(header, ["商品浏览量", "浏览量", "pv", "商品访客量"]),
      addUsers:  findIndexBy(header, ["加购人数", "加购买家数", "加购买家"]),
      addQty:    findIndexBy(header, ["商品加购件数", "加购件数"]),
      payItems:  findIndexBy(header, ["支付件数"]),
      payOrders: findIndexBy(header, ["支付订单数", "订单数"]),
      payBuyers: findIndexBy(header, ["支付买家数", "买家数"])
      // 注意：不映射 product_link
    };

    if (I.productId < 0) {
      throw new Error("未找到商品ID列（商品ID/商品id/product_id）");
    }

    // ---- 构造 payload（严格白名单，不带 product_link）----
    step = "build-payload";
    const payload = rows.map(r => ({
      period_type: periodType,
      period_end: dateStr,
      product_id: String(r[I.productId] || "").trim(),

      search_exposure: I.exposure >= 0 ? toNumber(r[I.exposure]) : null,
      uv:              I.uv       >= 0 ? toNumber(r[I.uv])       : null,
      pv:              I.pv       >= 0 ? toNumber(r[I.pv])       : null,
      add_to_cart_users: I.addUsers >= 0 ? toNumber(r[I.addUsers]) : null,
      add_to_cart_qty:   I.addQty   >= 0 ? toNumber(r[I.addQty])   : null,
      pay_items:       I.payItems >= 0 ? toNumber(r[I.payItems]) : null,
      pay_orders:      I.payOrders>= 0 ? toNumber(r[I.payOrders]): null,
      pay_buyers:      I.payBuyers>= 0 ? toNumber(r[I.payBuyers]): null
    }))
    .filter(x => x.product_id);

    if (!payload.length) {
      return res.status(200).json({ ok: true, type: periodType, date: dateStr, rows: 0 });
    }

    // ---- 最终白名单过滤（即使后续有人误加字段也会被剔除）----
    const safePayload = whitelistPayload(payload);

    // ---- Upsert ----
    step = "upsert";
    const { error } = await supabase
      .from("managed_stats")
      .upsert(safePayload, { onConflict: "period_type,period_end,product_id" });

    if (error) throw error;

    return res.status(200).json({
      ok: true,
      type: periodType,
      date: dateStr,
      rows: safePayload.length
    });

  } catch (e) {
    console.error("ingest-error step=", step, e);
    return res.status(500).json({ ok: false, step, msg: e.message });
  }
};

// 关闭 Next.js 默认 bodyParser，使用 multiparty 解析 multipart/form-data
module.exports.config = { api: { bodyParser: false } };

