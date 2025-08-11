const multiparty = require("multiparty");
const { createClient } = require("@supabase/supabase-js");
const xlsx = require("xlsx");

function supa() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase 环境变量缺失：请设置 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

/** —— 使用 UTC 判断，避免时区导致的日期偏移 —— */
const toUTC = (iso) => new Date(`${iso}T00:00:00Z`);
const isMonthEndUTC = (iso) => {
  const d = toUTC(iso);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return d.getUTCDate() === last;
};
const isSundayUTC = (iso) => toUTC(iso).getUTCDay() === 0;

/** 保留原来的类型推断（周/月底都满足时按行数兜底判断） */
function detectType(dateStr, rowCount) {
  const m = isMonthEndUTC(dateStr), w = isSundayUTC(dateStr);
  if (m && !w) return "month";
  if (!m && w) return "week";
  // 都满足或都不满足时，用行数做个兜底：少行=周，多行=月
  return rowCount < 300 ? "week" : "month";
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, msg: "Only POST" });

  let step = "init";
  try {
    const supabase = supa();

    step = "parse-multipart";
    const form = new multiparty.Form();
    const fileBuffer = await new Promise((resolve, reject) => {
      form.parse(req, (err, _fields, files) => {
        if (err) return reject(err);
        if (!files || !files.file || !files.file[0]) return reject(new Error("未收到文件：请检查 FormData.append('file', file)"));
        const fs = require("fs");
        const p = files.file[0].path;
        const buf = fs.readFileSync(p);
        resolve(buf);
      });
    });

    step = "read-xlsx";
    const wb = xlsx.read(fileBuffer, { type: "buffer" });
    const ws = wb.Sheets["汇总指标"] || wb.Sheets[wb.SheetNames[0]];
    const arr = xlsx.utils.sheet_to_json(ws, { header: 1 });

    if (!arr || !arr.length) throw new Error("Excel 为空或找不到工作表");

    const header = arr[0];
    const rows = arr.slice(1).filter(r => r && r.length);

    // 这里按你现有报表结构取统计日期；若是数值型日期(Excel 序号/yyyymmdd)也做了归一
    const rawDate = rows[0][1];
    const ds = String(rawDate);
    const dateStr = ds.includes("-") ? ds : `${ds.slice(0,4)}-${ds.slice(4,6)}-${ds.slice(6,8)}`;

    /** —— 新增：强校验，只允许周日或月底 —— */
    const onSunday = isSundayUTC(dateStr);
    const onMonthEnd = isMonthEndUTC(dateStr);
    if (!onSunday && !onMonthEnd) {
      // 友好的错误提示
      const w = ["日","一","二","三","四","五","六"][toUTC(dateStr).getUTCDay()];
      return res.status(400).json({
        ok: false,
        step: "validate-date",
        msg: `统计日期必须为【周日】或【当月最后一天】。检测到：${dateStr}（周${w}），已拒绝入库。`
      });
    }

    // —— 原逻辑：定位列、映射字段 ——
    const norm = s => String(s || "").replace(/[\s%（）()]/g, "").toLowerCase();
    const H = header.map(norm);
    const idx = (aliases) => {
      for (const a of aliases) { const i = H.indexOf(norm(a)); if (i !== -1) return i; }
      for (let i = 0; i < H.length; i++) { if (aliases.some(a => H[i].includes(norm(a)))) return i; }
      return -1;
    };
    const I = {
      productId: idx(["商品ID","商品id","productid","商品编号"]),
      productLink: idx(["产品链接","商品链接","链接","producturl","url"]),
      uv: idx(["商品访客数","访客数","uv"]),
      pv: idx(["商品浏览量","浏览量","pv"]),
      atcUsers: idx(["商品加购人数","加购人数"]),
      atcQty: idx(["商品加购件数","加购件数"]),
      payItems: idx(["支付件数"]),
      payOrders: idx(["支付订单数","订单数"]),
      payBuyers: idx(["支付买家数","买家数"]),
      searchExpo: idx(["搜索曝光量","曝光量","searchimpressions","曝光"]),
    };
    if (I.productId < 0) throw new Error("未找到 商品ID 列");

    const periodType = detectType(dateStr, rows.length);

    const payload = rows.map(r => ({
      period_type: periodType,
      period_end: dateStr,
      product_id: String(r[I.productId] || ""),
      product_link: I.productLink >= 0 ? String(r[I.productLink] || "") : null,
      search_exposure: I.searchExpo >= 0 ? Number(r[I.searchExpo] || 0) : null,
      uv: I.uv >= 0 ? Number(r[I.uv] || 0) : null,
      pv: I.pv >= 0 ? Number(r[I.pv] || 0) : null,
      add_to_cart_users: I.atcUsers >= 0 ? Number(r[I.atcUsers] || 0) : null,
      add_to_cart_qty: I.atcQty >= 0 ? Number(r[I.atcQty] || 0) : null,
      pay_items: I.payItems >= 0 ? Number(r[I.payItems] || 0) : null,
      pay_orders: I.payOrders >= 0 ? Number(r[I.payOrders] || 0) : null,
      pay_buyers: I.payBuyers >= 0 ? Number(r[I.payBuyers] || 0) : null
    })).filter(x => x.product_id);

    step = "upsert";
    const { error } = await supabase
      .from("managed_stats")
      .upsert(payload, { onConflict: "period_type,period_end,product_id" });

    if (error) throw error;

    return res.status(200).json({ ok: true, type: periodType, date: dateStr, rows: payload.length });
  } catch (e) {
    console.error("ingest-error step=", step, e);
    const code = step === "validate-date" ? 400 : 500;
    return res.status(code).json({ ok: false, step, msg: e.message });
  }
};

