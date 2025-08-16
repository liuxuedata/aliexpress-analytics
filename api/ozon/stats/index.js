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

    let query = supabase
      .from("ozon_product_report_wide")
      .select(
        "day,product_id,product_title,impressions_total,product_card_views,add_to_cart_total,items_ordered,items_buyout"
      )
      .eq("store_id", store_id)
      .order("day", { ascending: false });

    if (start_date) query = query.gte("day", start_date);
    if (end_date) query = query.lte("day", end_date);

    const { data, error } = await query;
    if (error) throw error;

    const mapped = (data || []).map((r) => ({
      day: r.day,
      product_id: r.product_id,
      product_title: r.product_title,
      impressions: r.impressions_total,
      sessions: r.product_card_views,
      pageviews: r.product_card_views,
      add_to_cart_users: r.add_to_cart_total,
      add_to_cart_qty: r.add_to_cart_total,
      items_sold: r.items_buyout,
      orders: r.items_ordered,
      buyers: r.items_buyout,
    }));

    res.status(200).json({ ok: true, rows: mapped });
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
};
