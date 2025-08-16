const { createClient } = require("@supabase/supabase-js");

function supa() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

function weekEnd(iso) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - d.getUTCDay() + 6); // Sunday week end
  return d.toISOString().slice(0, 10);
}
function monthEnd(iso) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + 1, 0); // last day of month
  return d.toISOString().slice(0, 10);
}

module.exports = async (req, res) => {
  try {
    const supabase = supa();
    const { data, error } = await supabase
      .from("ozon_daily_product_metrics")
      .select("day")
      .order("day", { ascending: false });
    if (error) throw error;
    const days = (data || []).map(r => r.day);
    const weeks = Array.from(new Set(days.map(weekEnd))).sort().reverse();
    const months = Array.from(new Set(days.map(monthEnd))).sort().reverse();
    res.status(200).json({ ok: true, weeks, months });
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
};
