
const multiparty = require("multiparty");

const { createClient } = require("@supabase/supabase-js");
const xlsx = require("xlsx");

function supa() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  return createClient(url, key, { auth: { persistSession: false } });
}

const isMonthEnd = (d) => {
  const dt = new Date(d);
  const last = new Date(dt.getFullYear(), dt.getMonth()+1, 0).getDate();
  return dt.getDate() === last;
};
const isWeekEnd = (d) => new Date(d).getDay() === 0; // Sunday

// Normalize Chinese header names (remove spaces, symbols)
function norm(s){
  return String(s||"").replace(/[\s%（）()]/g, "").toLowerCase();
}

// Try to find index by alias list
function idxByAliases(header, aliases){
  const H = header.map(norm);
  for (const a of aliases){
    const ai = H.indexOf(norm(a));
    if (ai !== -1) return ai;
  }
  // fuzzy contains
  for (let i=0;i<H.length;i++){
    if (aliases.some(a => H[i].includes(norm(a)))) return i;
  }
  return -1;
}

// Return basic mapping indexes
function buildIndexes(header){
  return {
    productId: idxByAliases(header, ["商品ID","商品id","productid","商品编号"]),
    productLink: idxByAliases(header, ["产品链接","商品链接","链接","producturl","url"]),
    searchExpo: idxByAliases(header, ["搜索曝光量","曝光量","searchimpressions","曝光"]),
    uv: idxByAliases(header, ["商品访客数","访客数","uv"]),
    pv: idxByAliases(header, ["商品浏览量","浏览量","pv"]),
    atcUsers: idxByAliases(header, ["商品加购人数","加购人数"]),
    atcQty: idxByAliases(header, ["商品加购件数","加购件数"]),
    favUsers: idxByAliases(header, ["商品收藏人数","收藏人数"]),
    payItems: idxByAliases(header, ["支付件数"]),
    payOrders: idxByAliases(header, ["支付订单数","订单数"]),
    payBuyers: idxByAliases(header, ["支付买家数","买家数"]),
    payRate: idxByAliases(header, ["支付转化率"]),
    rankPercent: idxByAliases(header, ["排名百分比","排名%","排名占比"]),
    isWarehouse: idxByAliases(header, ["是否前置仓","前置仓"]),
    suborders30d: idxByAliases(header, ["30天子订单数","30天子单数","30天子订单"]),
    isPremium: idxByAliases(header, ["是否金冠商品","金冠","是否金冠"]),
    dateCol: 1 // 假定第2列是统计日期，如 20250803/20250731；如变更可扩展
  };
}

async function getMedians(supabase){
  const { data } = await supabase
    .from("ingest_log")
    .select("detected_type,row_count,uv_sum")
    .order("created_at", { ascending:false })
    .limit(5000);

  const byType = { week:[], month:[] };
  (data||[]).forEach(r => { if(r.detected_type && byType[r.detected_type]) byType[r.detected_type].push(r); });

  function median(arr, k){
    if(!arr.length) return null;
    const vals = arr.map(x=>x[k]).filter(v=>typeof v === "number").sort((a,b)=>a-b);
    if(!vals.length) return null;
    const mid = Math.floor(vals.length/2);
    return vals.length%2 ? vals[mid] : Math.round((vals[mid-1]+vals[mid])/2);
  }
  return {
    week: { row: median(byType.week,"row_count"), uv: median(byType.week,"uv_sum") },
    month:{ row: median(byType.month,"row_count"), uv: median(byType.month,"uv_sum") }
  };
}

function detectType(dateStr, rowCount, uvSum, med){
  const d = new Date(dateStr);
  const mEnd = isMonthEnd(d);
  const wEnd = isWeekEnd(d);

  if (mEnd && !wEnd) return "month";
  if (!mEnd && wEnd) return "week";

  // ambiguous: choose closer to medians
  if (med.week.row && med.month.row) {
    const drw = Math.abs(rowCount - med.week.row);
    const drm = Math.abs(rowCount - med.month.row);
    if (drw !== drm) return drw < drm ? "week" : "month";
  }
  if (med.week.uv && med.month.uv) {
    const duw = Math.abs(uvSum - med.week.uv);
    const dum = Math.abs(uvSum - med.month.uv);
    if (duw !== dum) return duw < dum ? "week" : "month";
  }
  // fallback threshold
  return rowCount < 300 ? "week" : "month";
}

module.exports = { supa, xlsx, buildIndexes, detectType, getMedians };


module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok:false, msg:"Only POST" });
  try {
    // Parse multipart form to get file buffer
    const form = new multiparty.Form();
    const fileBuffer = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err);
        if (!files || !files.file || !files.file[0]) return reject(new Error("No file"));
        const fs = require("fs");
        const p = files.file[0].path;
        const buf = fs.readFileSync(p);
        resolve(buf);
      });
    });

    const supabase = supa();
    const wb = xlsx.read(fileBuffer, { type: "buffer" });
    const ws = wb.Sheets["汇总指标"] || wb.Sheets[wb.SheetNames[0]];
    const arr = xlsx.utils.sheet_to_json(ws, { header: 1 });
    if (!arr || !arr.length) throw new Error("Empty sheet");

    const header = arr[0];
    const rows = arr.slice(1).filter(r => r && r.length);

    // 统计日期在第2列（如 20250803）
    const rawDate = rows[0][1];
    const ds = String(rawDate);
    const dateStr = ds.includes("-") ? ds : `${ds.slice(0,4)}-${ds.slice(4,6)}-${ds.slice(6,8)}`;

    // Index mapping
    const idx = buildIndexes(header);

    // UV 合计用于判别
    const uvSum = rows.reduce((s,r) => s + (parseInt(r[idx.uv]||0)), 0);

    // 可选外部强制类型
    const force = (req.query && req.query.force) ? String(req.query.force) : null;

    // 基线
    const med = await getMedians(supabase);

    // 判别类型
    const periodType = force === "week" || force === "month" ? force : detectType(dateStr, rows.length, uvSum, med);

    // Build payload
    const payload = rows.map(r => ({ 
      period_type: periodType,
      period_end: dateStr,
      product_id: String(r[idx.productId] || ""),
      product_link: idx.productLink >= 0 ? String(r[idx.productLink]||"") : null,
      search_exposure: idx.searchExpo >=0 ? Number(r[idx.searchExpo]||0) : null,
      uv: idx.uv >=0 ? Number(r[idx.uv]||0) : null,
      pv: idx.pv >=0 ? Number(r[idx.pv]||0) : null,
      add_to_cart_users: idx.atcUsers >=0 ? Number(r[idx.atcUsers]||0) : null,
      add_to_cart_qty: idx.atcQty >=0 ? Number(r[idx.atcQty]||0) : null,
      fav_users: idx.favUsers >=0 ? Number(r[idx.favUsers]||0) : null,
      pay_items: idx.payItems >=0 ? Number(r[idx.payItems]||0) : null,
      pay_orders: idx.payOrders >=0 ? Number(r[idx.payOrders]||0) : null,
      pay_buyers: idx.payBuyers >=0 ? Number(r[idx.payBuyers]||0) : null,
      pay_rate: idx.payRate >=0 ? Number(String(r[idx.payRate]||0).toString().replace('%','')) : null,
      rank_percent: idx.rankPercent >=0 ? Number(r[idx.rankPercent]||0) : null,
      is_warehouse: idx.isWarehouse >=0 ? (String(r[idx.isWarehouse]).includes("是") || String(r[idx.isWarehouse]).toLowerCase()==="true") : null,
      suborders_30d: idx.suborders30d >=0 ? Number(r[idx.suborders30d]||0) : null,
      is_premium: idx.isPremium >=0 ? (String(r[idx.isPremium]).includes("是") || String(r[idx.isPremium]).toLowerCase()==="true") : null,
    })).filter(x=>x.product_id);

    // UPSERT
    const { error } = await supabase
      .from("managed_stats")
      .upsert(payload, { onConflict: "period_type,period_end,product_id" });
    if (error) throw error;

    await supabase.from("ingest_log").insert({
      file_name: (req.headers["x-file-name"]||""),
      period_end: dateStr,
      detected_type: periodType,
      row_count: rows.length,
      uv_sum: uvSum
    });

    return res.status(200).json({ ok:true, type: periodType, date: dateStr, rows: rows.length });
  } catch (e) {
    return res.status(500).json({ ok:false, msg: e.message });
  }
};
