// /api/new-products/index.js
const { createClient } = require("@supabase/supabase-js");

function supa() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}
const pad2 = n => (n < 10 ? "0" + n : "" + n);
const toMMDD = iso => { const d = new Date(iso + "T00:00:00Z"); return pad2(d.getUTCMonth()+1)+pad2(d.getUTCDate()); };

function viewOf(platform){
  if (platform === "managed") return "managed_new_products";
  if (platform === "self")    return "ae_self_new_products";
  throw new Error("platform must be 'managed' or 'self'");
}
function statsTableOf(platform){
  if (platform === "managed") return "managed_stats";
  if (platform === "self")    return "ae_self_operated_daily";
  throw new Error("platform must be 'managed' or 'self'");
}

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ ok:false, msg:"Only GET" });
  const supabase = supa();
  try {
    const platform = String(req.query.platform||"").trim();
    if (!platform) throw new Error("Missing platform");
    const view = viewOf(platform);
    const statsTable = statsTableOf(platform);

    let { from, to } = req.query;
    const limit = Math.max(1, Math.min(parseInt(req.query.limit||"500",10)||500, 5000));

    // 自动取该平台最近一周（按周末日）
    if (!from || !to) {
      const { data: lastRows, error: lastErr } = await supabase
        .from(statsTable).select("period_end, stat_date").order("period_end", { ascending:false }).limit(1);
      if (lastErr) throw lastErr;
      const last = lastRows && lastRows[0];
      const iso = (last?.period_end || last?.stat_date || "").slice(0,10);
      if (!iso) return res.status(200).json({ ok:true, platform, range:null, new_count:0, items:[] });
      from = to = iso;
    }

    const { data, error } = await supabase
      .from(view)
      .select("product_id, first_seen")
      .gte("first_seen", from)
      .lte("first_seen", to)
      .order("first_seen", { ascending: true })
      .limit(limit);
    if (error) throw error;

    const items = (data||[]).map(r => ({
      product_id: r.product_id,
      first_seen: r.first_seen,
      first_seen_mmdd: toMMDD(r.first_seen)
    }));

    res.status(200).json({ ok:true, platform, range:{from,to}, new_count: items.length, items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, msg:e.message });
  }
};

