const { createClient } = require("@supabase/supabase-js");

function supa() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, msg: "Only GET" });
  }
  try {
    const supabase = supa();
    const { store_id, start_date, end_date, only_new } = req.query;
    // TODO: 查询 ozon_daily_product_metrics 与 ozon_first_seen 计算 KPI
    res.status(200).json({ ok: true, kpis: {}, rows: [] });
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
};
