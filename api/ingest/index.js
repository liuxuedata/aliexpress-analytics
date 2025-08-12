// /pages/api/ingest/index.js —— 自适应列 + 智能周期判定（只改 ingest）
// 依赖：multiparty、xlsx、@supabase/supabase-js
// 规则：
// 1) 统计日期必须是「周日」或「当月最后一天」，否则拒绝上传（400）。
// 2) 若同时既是周日又是月末（冲突），则：
//    - 对比「上一个周周期」与「上一个月周期」的产品行数（managed_stats 中的行数）
//    - 取与当前 Excel 行数更相近的那个粒度（若只有一边有历史，就用那一边；若都没有，<300 视作 week，否则 month）。
// 3) 运行时探测 managed_stats 的真实列名，只写存在的列（避免 schema cache 报错）。
// 4) 不写 product_link、不写任何比率列。支持 ?dry_run=1。

const multiparty = require("multiparty");
const { createClient } = require("@supabase/supabase-js");
const xlsx = require("xlsx");
const fs = require("fs");

function supa() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

const toNum = (v) => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};
const norm = (s) => String(s||"").replace(/[\s%（）()]/g, "").toLowerCase();

// 以 UTC 方式判断周日/月底，避免时区偏移
function parseYmd(ymd) {
  const [y,m,d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m-1, d));
}
function isSunday(ymd) {
  const dt = parseYmd(ymd);
  return dt.getUTCDay() === 0;
}
function isMonthEnd(ymd) {
  const dt = parseYmd(ymd);
  const y = dt.getUTCFullYear(), m = dt.getUTCMonth()+1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return dt.getUTCDate() === last;
}

// 探测 DB 真实列
async function probeDbColumns(supabase) {
  try {
    const { data } = await supabase.from("managed_stats").select("*").limit(1);
    const cols = data && data.length ? Object.keys(data[0]) : [];
    const has = (c) => cols.includes(c);
    const pick = (...cands) => cands.find(has) || null;
    return {
      product_id: "product_id",
      period_type: "period_type",
      period_end: "period_end",
      exposure:  pick("search_exposure","impressions","exposure"),
      uv:        pick("uv","visitors"),
      pv:        pick("pv","pageviews"),
      atc_users: pick("atc_users","add_to_cart_users","cart_users"),
      atc_qty:   pick("atc_qty","add_to_cart_qty","cart_qty"),
      pay_items: pick("pay_items","payment_items"),
      pay_orders:pick("pay_orders","orders"),
      pay_buyers:pick("pay_buyers","buyers"),
    };
  } catch {
    // 表为空或不可探测时，返回常用名，后续构造时若为空会跳过写入
    return {
      product_id: "product_id",
      period_type: "period_type",
      period_end: "period_end",
      exposure:  "search_exposure",
      uv:        "uv",
      pv:        "pv",
      atc_users: "atc_users",
      atc_qty:   "atc_qty",
      pay_items: "pay_items",
      pay_orders:"pay_orders",
      pay_buyers:"pay_buyers",
    };
  }
}

// 取上一个指定粒度的周期行数（按 period_end 最近）
async function getPrevCount(supabase, type, beforeDate) {
  const { data: last, error: e1 } = await supabase
    .from("managed_stats")
    .select("period_end")
    .eq("period_type", type)
    .lt("period_end", beforeDate)
    .order("period_end", { ascending: false })
    .limit(1);
  if (e1 || !last || !last.length) return { period_end: null, count: null };

  const prevEnd = last[0].period_end;
  // 行数 ~ 产品数（每产品一行）
  const { count, error: e2 } = await supabase
    .from("managed_stats")
    .select("product_id", { count: "exact", head: true })
    .eq("period_type", type)
    .eq("period_end", prevEnd);
  if (e2) return { period_end: prevEnd, count: null };
  return { period_end: prevEnd, count: count ?? null };
}

// Excel 列别名
const XL = {
  productId: ["商品ID","商品id","productid","商品编号","id","product id"],
  exposure:  ["搜索曝光量","曝光量","searchimpressions","曝光"],
  uv:        ["商品访客数","访客数","访客人数","商品访问数","uv","uniquevisitors","visitors"],
  pv:        ["商品浏览量","浏览量","pv","pageviews","商品pv"],
  atcUsers:  ["商品加购人数","加购人数","加购买家数"],
  atcQty:    ["商品加购件数","加购件数"],
  payItems:  ["支付件数","付款件数"],
  payOrders: ["支付订单数","订单数","支付订单"],
  payBuyers: ["支付买家数","买家数","支付人数"],
  date:      ["日期","统计日期","date"]
};
function pickIdx(headerNorm, aliases){
  for (const a of aliases){ const i = headerNorm.indexOf(norm(a)); if (i !== -1) return i; }
  for (let i=0;i<headerNorm.length;i++){ if (aliases.some(a => headerNorm[i].includes(norm(a)))) return i; }
  return -1;
}

// 从单元格或文件名拿日期（YYYY-MM-DD）
function dateFromCellOrFilename(rows, dateIdx, filename){
  if (dateIdx >= 0 && rows.length){
    const raw = rows[0][dateIdx]; const ds = String(raw||"");
    if (/^\d{4}-\d{2}-\d{2}$/.test(ds)) return ds;
    if (/^\d{8}$/.test(ds)) return ds.slice(0,4)+'-'+ds.slice(4,6)+'-'+ds.slice(6,8);
  }
  const m = String(filename||"").match(/(20\d{2})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

module.exports = async (req, res) => {
  if (req.method === "GET") return res.status(200).json({ ok:true, msg:"ingest alive" });
  if (req.method !== "POST") return res.status(405).json({ ok:false, msg:"Only POST" });

  let step = "init";
  try {
    const supabase = supa();

    // 0) 探测 DB 列映射
    step = "probe-columns";
    const colMap = await probeDbColumns(supabase);

    // 1) 解析 multipart
    step = "multipart";
    const form = new multiparty.Form({ uploadDir: "/tmp" });
    const { fileBuffer, originalName } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err);
        const f = files?.file?.[0] || files?.excel?.[0] || files?.upload?.[0];
        if (!f) return reject(new Error("未收到文件：请检查 FormData.append('file', file)"));
        const p = f.path || f.filepath;
        try {
          const buf = fs.readFileSync(p);
          resolve({ fileBuffer: buf, originalName: f.originalFilename || f.filename || f.name || "upload.xlsx" });
        } catch (e) { reject(e); }
      });
    });

    // 2) 读取 Excel
    step = "xlsx";
    const wb = xlsx.read(fileBuffer, { type: "buffer" });
    const ws = wb.Sheets["汇总指标"] || wb.Sheets[wb.SheetNames[0]];
    const arr = xlsx.utils.sheet_to_json(ws, { header: 1 });
    if (!arr || !arr.length) throw new Error("Excel 为空或找不到工作表");
    const header = arr[0]; const rows = arr.slice(1).filter(r => r && r.length);
    const H = header.map(norm);
    const rowCount = rows.length;

    // 3) 统计日期 & 校验
    const dateIdx = pickIdx(H, XL.date);
    const period_end = dateFromCellOrFilename(rows, dateIdx, originalName);
    if (!period_end) {
      return res.status(400).json({ ok:false, stage:"period", msg:"无法确定统计日期：请在表中包含“日期”列或将文件名包含 YYYYMMDD" });
    }
    const flagSun = isSunday(period_end);
    const flagMonthEnd = isMonthEnd(period_end);
    if (!flagSun && !flagMonthEnd) {
      return res.status(400).json({ ok:false, stage:"period", msg:`统计日期 ${period_end} 不是周日也不是月末最后一天，禁止上传。请确认导出的周/月底数据。` });
    }

    // 4) 判定 period_type
    let period_type = null;
    let decision = "rule";
    if (flagSun && !flagMonthEnd) period_type = "week";
    else if (!flagSun && flagMonthEnd) period_type = "month";
    else {
      // 同时为周日 & 月末：用历史“周/月”行数来判定
      step = "disambiguate";
      const [wk, mon] = await Promise.all([
        getPrevCount(supabase, "week",  period_end),
        getPrevCount(supabase, "month", period_end),
      ]);
      const wCnt = wk.count, mCnt = mon.count;
      if (wCnt != null && mCnt != null) {
        const diffW = Math.abs(rowCount - wCnt) / Math.max(1, wCnt);
        const diffM = Math.abs(rowCount - mCnt) / Math.max(1, mCnt);
        period_type = diffW <= diffM ? "week" : "month";
        decision = `closest(${period_type})`;
      } else if (wCnt != null) {
        period_type = "week"; decision = "only-week-history";
      } else if (mCnt != null) {
        period_type = "month"; decision = "only-month-history";
      } else {
        period_type = rowCount < 300 ? "week" : "month";
        decision = "fallback-by-size";
      }
    }

    // 5) excel 列索引
    const I = {
      productId: pickIdx(H, XL.productId),
      exposure:  pickIdx(H, XL.exposure),
      uv:        pickIdx(H, XL.uv),
      pv:        pickIdx(H, XL.pv),
      atcUsers:  pickIdx(H, XL.atcUsers),
      atcQty:    pickIdx(H, XL.atcQty),
      payItems:  pickIdx(H, XL.payItems),
      payOrders: pickIdx(H, XL.payOrders),
      payBuyers: pickIdx(H, XL.payBuyers),
    };
    if (I.productId < 0) throw new Error("未找到 商品ID 列");

    // 6) 组装 payload（仅写 DB 存在的列）
    step = "build";
    const buildRow = (r) => {
      const pid = String(r[I.productId] || "").match(/(\d{6,})/);
      if (!pid) return null;
      const base = { product_id: pid[0], period_type, period_end };
      const put = (key, v) => { if (key && v !== undefined && v !== null) base[key] = v; };
      if (colMap.exposure)  put(colMap.exposure,  I.exposure>=0  ? toNum(r[I.exposure])  : null);
      if (colMap.uv)        put(colMap.uv,        I.uv>=0        ? toNum(r[I.uv])        : null);
      if (colMap.pv)        put(colMap.pv,        I.pv>=0        ? toNum(r[I.pv])        : null);
      if (colMap.atc_users) put(colMap.atc_users, I.atcUsers>=0  ? toNum(r[I.atcUsers])  : null);
      if (colMap.atc_qty)   put(colMap.atc_qty,   I.atcQty>=0    ? toNum(r[I.atcQty])    : null);
      if (colMap.pay_items) put(colMap.pay_items, I.payItems>=0  ? toNum(r[I.payItems])  : null);
      if (colMap.pay_orders)put(colMap.pay_orders,I.payOrders>=0 ? toNum(r[I.payOrders]) : null);
      if (colMap.pay_buyers)put(colMap.pay_buyers,I.payBuyers>=0 ? toNum(r[I.payBuyers]) : null);
      return base;
    };
    const payload = rows.map(buildRow).filter(Boolean);

    // 7) dry run
    if (req.url && req.url.includes("dry_run=1")) {
      return res.status(200).json({
        ok: true, dry_run: true,
        period_end, period_type, decision,
        excel_rows: rowCount,
        db_column_map: colMap,
        sample: payload.slice(0, 10),
      });
    }

    // 8) upsert
    step = "upsert";
    const { error } = await supabase
      .from("managed_stats")
      .upsert(payload, { onConflict: "product_id,period_type,period_end" });
    if (error) throw error;

    return res.status(200).json({ ok:true, period_end, period_type, decision, rows: payload.length });
  } catch (e) {
    console.error("ingest-error", step, e);
    return res.status(500).json({ ok:false, step, msg: e.message });
  }
};
