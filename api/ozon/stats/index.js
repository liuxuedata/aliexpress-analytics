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
    const { store_id, start_date, end_date } = req.query;
    if (!store_id) {
      return res.status(400).json({ ok: false, msg: "missing store_id" });
    }

    const { data: probe } = await supabase
      .from("ozon_daily_product_metrics")
      .select("*")
      .limit(1);
    const cols = probe && probe.length ? Object.keys(probe[0]) : [];
    const expCol = cols.includes("exposure") ? "exposure" : "search_exposure";

    let query = supabase
      .from("ozon_daily_product_metrics")
      .select(
        `day,product_id,product_title,${expCol},uv,pv,add_to_cart_users,add_to_cart_qty,pay_items,pay_orders,pay_buyers`
      )
      .eq("store_id", store_id)
      .order("day", { ascending: false });

    if (start_date) query = query.gte("day", start_date);
    if (end_date) query = query.lte("day", end_date);

    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];
    if (expCol !== "exposure") {
      rows.forEach((r) => {
        r.exposure = r[expCol];
        delete r[expCol];
      });
    }

    res.status(200).json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
};
