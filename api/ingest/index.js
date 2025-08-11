
// /pages/api/ingest/index.js  —— REVIEWED & FIXED (CJS + multiparty + xlsx + supabase)
/**
 * 修复点：
 * 1) 不再写入 product_link（后端生成，避免 "cannot insert non-DEFAULT into product_link"）
 * 2) 字段名对齐数据库：atc_users / atc_qty（你表不是 add_to_cart_*）
 * 3) 数字解析更健壮（去逗号、空格；非数字回退 0），避免 "1,234" -> NaN
 * 4) 仍支持周/月自动判定；仍兼容“汇总指标”sheet 或首个sheet
 */
const multiparty = require("multiparty");
const { createClient } = require("@supabase/supabase-js");
const xlsx = require("xlsx");
const fs = require("fs");

function supa() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase 环境变量缺失：请设置 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

const toNum = (v) => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/,/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const isMonthEnd = (d) => { const dt = new Date(d); const last = new Date(dt.getFullYear(), dt.getMonth()+1, 0).getDate(); return dt.getDate() === last; };
const isWeekEnd = (d) => new Date(d).getDay() === 0;
function detectType(dateStr, rowCount){ const d=new Date(dateStr); const m=isMonthEnd(d), w=isWeekEnd(d); if(m && !w) return "month"; if(!m && w) return "week"; return rowCount<300?"week":"month"; }

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok:false, msg:"Only POST" });
  let step = "init";
  try {
    const supabase = supa();

    step="parse-multipart";
    const form = new multiparty.Form({ uploadDir: "/tmp" });
    const fileBuffer = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err);
        const f = files?.file?.[0] || files?.excel?.[0] || files?.upload?.[0];
        if (!f) return reject(new Error("未收到文件：请检查 FormData.append('file', file)"));
        const p = f.path || f.filepath;
        try {
          const buf = fs.readFileSync(p);
          resolve(buf);
        } catch (e) {
          reject(e);
        }
      });
    });

    step="read-xlsx";
    const wb = xlsx.read(fileBuffer, { type: "buffer" });
    const ws = wb.Sheets["汇总指标"] || wb.Sheets[wb.SheetNames[0]];
    const arr = xlsx.utils.sheet_to_json(ws, { header: 1 });
    if (!arr || !arr.length) throw new Error("Excel 为空或找不到工作表");

    const header = arr[0];
    const rows = arr.slice(1).filter(r => r && r.length);

    // 取日期：优先找“日期”列，否则退化用 rows[0][1]
    let dateStr = null;
    const norm = s => String(s||"").replace(/[\s%（）()]/g, "").toLowerCase();
    const H = header.map(norm);
    const dateIdx = H.findIndex(h => h.includes("日期") || h === "date");
    if (dateIdx >= 0) {
      const raw = rows[0][dateIdx];
      const ds = String(raw);
      dateStr = ds.includes("-") ? ds : `${ds.slice(0,4)}-${ds.slice(4,6)}-${ds.slice(6,8)}`;
    } else {
      const rawDate = rows[0][1];
      const ds = String(rawDate);
      dateStr = ds.includes("-") ? ds : `${ds.slice(0,4)}-${ds.slice(4,6)}-${ds.slice(6,8)}`;
    }

    // 索引（包含模糊匹配）
    const idx = (aliases) => {
      for (const a of aliases){ const i=H.indexOf(norm(a)); if(i!==-1) return i; }
      for(let i=0;i<H.length;i++){ if(aliases.some(a=>H[i].includes(norm(a)))) return i; }
      return -1;
    };
    const I = {
      productId: idx(["商品ID","商品id","productid","商品编号","id"]),
      // productLink: idx(["产品链接","商品链接","链接","producturl","url"]), // 不再写入
      uv: idx(["商品访客数","访客数","uv"]),
      pv: idx(["商品浏览量","浏览量","pv"]),
      atcUsers: idx(["商品加购人数","加购人数"]),
      atcQty: idx(["商品加购件数","加购件数"]),
      payItems: idx(["支付件数","付款件数"]),
      payOrders: idx(["支付订单数","订单数"]),
      payBuyers: idx(["支付买家数","买家数","支付人数"]),
      searchExpo: idx(["搜索曝光量","曝光量","searchimpressions","曝光"]),
    };
    if (I.productId < 0) throw new Error("未找到 商品ID 列");

    const periodType = detectType(dateStr, rows.length);

    // 只写数据库已存在的列名（与你线上一致）：
    // search_exposure, uv, pv, atc_users, atc_qty, pay_items, pay_orders, pay_buyers
    const payload = rows.map(r => ({
      period_type: periodType,
      period_end: dateStr,
      product_id: String(r[I.productId] || ""),
      search_exposure: I.searchExpo>=0 ? toNum(r[I.searchExpo]) : null,
      uv:              I.uv>=0        ? toNum(r[I.uv])        : null,
      pv:              I.pv>=0        ? toNum(r[I.pv])        : null,
      atc_users:       I.atcUsers>=0  ? toNum(r[I.atcUsers])  : null,
      atc_qty:         I.atcQty>=0    ? toNum(r[I.atcQty])    : null,
      pay_items:       I.payItems>=0  ? toNum(r[I.payItems])  : null,
      pay_orders:      I.payOrders>=0 ? toNum(r[I.payOrders]) : null,
      pay_buyers:      I.payBuyers>=0 ? toNum(r[I.payBuyers]) : null,
    })).filter(x=>x.product_id);

    step="upsert";
    const { error } = await supabase
      .from("managed_stats")
      .upsert(payload, { onConflict: "period_type,period_end,product_id" });
    if (error) throw error;
    return res.status(200).json({ ok:true, type: periodType, date: dateStr, rows: payload.length });
  } catch(e){
    console.error("ingest-error step=", step, e);
    return res.status(500).json({ ok:false, step, msg: e.message });
  }
};
