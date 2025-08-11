
// pages/api/ingest/index.js  —— 单文件（诊断版，动态 import，任何报错都返回 JSON）
export const config = { api: { bodyParser: false } };

function toNumber(v){
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/,/g,"").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function normalizeHeader(h){
  return String(h||"").toLowerCase().replace(/\s+/g,"").replace(/[%（）()]/g,"").replace(/：/g,":");
}
const SYNONYMS = {
  product_id: ["商品id","商品ID","产品id","产品ID","id","product id","product_id","商品Id"],
  impressions: ["搜索曝光量","曝光量","searchimpressions","曝光"],
  visitors: ["商品访客数","访客数","访客人数","商品访问数","uniquevisitors","visitors"],
  pageviews: ["商品浏览量","浏览量","pageviews","商品pv"],
  add_to_cart_users: ["商品加购人数","加购人数","加购买家数"],
  add_to_cart_qty: ["商品加购件数","加购件数"],
  pay_items: ["支付件数","付款件数"],
  pay_orders: ["支付订单数","订单数","支付订单"],
  pay_buyers: ["支付买家数","支付人数","付款买家数"],
  date: ["日期","统计日期","date"],
};
function pickField(row, keys){
  for (const k of keys){
    if (k in row) return row[k];
    const key = Object.keys(row).find(h => normalizeHeader(h) === normalizeHeader(k));
    if (key) return row[key];
  }
  return "";
}
function pickText(row, keys){ const v = pickField(row, keys); return v == null ? "" : String(v).trim(); }
function pickNumber(row, keys){ return toNumber(pickField(row, keys)); }
function parseDateFromFilename(name){
  const m = String(name||"").match(/(20\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export default async function handler(req, res){
  if (req.method === "GET"){
    return res.status(200).json({ ok:true, msg:"ingest alive" });
  }
  if (req.method !== "POST"){
    return res.status(405).json({ ok:false, msg:"Use POST with form-data: file + period_end(optional)" });
  }

  let formidable, XLSX, createClient, fs;
  try {
    formidable = (await import("formidable")).default;
    XLSX = (await import("xlsx")).default;
    fs = (await import("fs")).default;
    ({ createClient } = await import("@supabase/supabase-js"));
  } catch (e) {
    return res.status(500).json({ ok:false, stage:"import", msg: e.message, stack: String(e.stack||"").split("\n").slice(0,5).join("\n") });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  let supabase;
  try{
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  }catch(e){
    return res.status(500).json({ ok:false, stage:"supabase", msg:e.message });
  }

  // parse multipart
  let fields, files;
  try {
    const form = formidable({ multiples:false, keepExtensions:true, uploadDir:"/tmp" });
    ({ fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => err ? reject(err) : resolve({ fields, files }));
    }));
  } catch (e) {
    return res.status(400).json({ ok:false, stage:"multipart", msg:e.message });
  }

  try {
    const f = files.file || files.excel || files.upload;
    if (!f) return res.status(400).json({ ok:false, stage:"input", msg:"缺少文件字段(file/excel/upload)" });

    const fp = Array.isArray(f) ? f[0].filepath || f[0].path : f.filepath || f.path;
    const ofn = Array.isArray(f) ? f[0].originalFilename || f[0].name : f.originalFilename || f.name;
    if (!fp) return res.status(400).json({ ok:false, stage:"input", msg:"无法读取临时文件路径" });

    const explicit = fields.period_end ? String(fields.period_end) : null;
    const period_end = explicit || parseDateFromFilename(ofn);
    if (!period_end) return res.status(400).json({ ok:false, stage:"period", msg:"无法确定周期（period_end 或 文件名包含 YYYYMMDD）" });

    const buf = await fs.promises.readFile(fp);

    // Read rows
    let rows = [];
    try {
      const wb = XLSX.read(buf, { type: "buffer" });
      for (const sn of wb.SheetNames){
        const ws = wb.Sheets[sn];
        const r = XLSX.utils.sheet_to_json(ws, { raw:false, defval:"" });
        if (r && r.length) { rows = r; break; }
      }
    } catch (e) {
      return res.status(400).json({ ok:false, stage:"xlsx", msg:e.message });
    }
    if (!rows.length) return res.status(400).json({ ok:false, stage:"xlsx", msg:"Excel 为空" });

    // Build records
    const records = [];
    for (const row of rows){
      const pidMatch = String(pickText(row, SYNONYMS.product_id)).match(/(\d{6,})/);
      if (!pidMatch) continue;
      const product_id = pidMatch[0];

      const impressions = pickNumber(row, SYNONYMS.impressions);
      const visitors = pickNumber(row, SYNONYMS.visitors);
      const pageviews = pickNumber(row, SYNONYMS.pageviews);
      const add_to_cart_users = pickNumber(row, SYNONYMS.add_to_cart_users);
      const add_to_cart_qty = pickNumber(row, SYNONYMS.add_to_cart_qty);
      const pay_items = pickNumber(row, SYNONYMS.pay_items);
      const pay_orders = pickNumber(row, SYNONYMS.pay_orders);
      const pay_buyers = pickNumber(row, SYNONYMS.pay_buyers);

      const visit_to_cart_rate = visitors > 0 ? add_to_cart_users / visitors : 0;
      const cart_to_pay_rate = add_to_cart_users > 0 ? pay_buyers / add_to_cart_users : 0;
      const pay_rate = visitors > 0 ? pay_buyers / visitors : 0;

      records.push({
        product_id,
        period_type: "week",
        period_end,
        impressions,
        visitors,
        pageviews,
        add_to_cart_users,
        add_to_cart_qty,
        pay_items,
        pay_orders,
        pay_buyers,
        visit_to_cart_rate,
        cart_to_pay_rate,
        pay_rate,
      });
    }

    const dry = (req.query?.dry_run === "1" || fields.dry_run === "1");
    if (dry) return res.status(200).json({ ok:true, dry_run:true, period_end, count:records.length, sample:records.slice(0,10) });

    // Upsert
    const { data, error } = await supabase
      .from("managed_stats")
      .upsert(records, { onConflict: "product_id,period_type,period_end" })
      .select("product_id");

    if (error) return res.status(500).json({ ok:false, stage:"upsert", msg:error.message });

    return res.status(200).json({ ok:true, period_end, count: data?.length || records.length });
  } catch (e) {
    return res.status(500).json({ ok:false, stage:"unknown", msg:e.message, stack: String(e.stack||"").split("\n").slice(0,5).join("\n") });
  }
}
