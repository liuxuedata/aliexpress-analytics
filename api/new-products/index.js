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
    if (platform === "indep")  return "independent_first_seen";
    throw new Error("platform must be 'managed', 'self', or 'indep'");
  }
  function statsTableOf(platform){
    if (platform === "managed") return "managed_stats";
    if (platform === "self")    return "ae_self_operated_daily";
    if (platform === "indep")  return "independent_landing_metrics";
    throw new Error("platform must be 'managed', 'self', or 'indep'");
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

    // 自动取该平台最近一天（按统计表日期列）
    if (!from || !to) {
      let dateCol = 'period_end';
      let altCol = 'stat_date';
      if (platform === 'indep') {
        dateCol = 'day';
        altCol = '';
      }
      const selCols = [dateCol, altCol].filter(Boolean).join(',');
      const { data: lastRows, error: lastErr } = await supabase
        .from(statsTable)
        .select(selCols)
        .order(dateCol, { ascending: false })
        .limit(1);
      if (lastErr) throw lastErr;
      const last = lastRows && lastRows[0];
      const iso = (last?.[dateCol] || last?.[altCol] || '').slice(0, 10);
      if (!iso) return res.status(200).json({ ok: true, platform, range: null, new_count: 0, items: [] });
      from = to = iso;
    }

    const idCol = platform === 'indep' ? 'landing_path' : 'product_id';
    const firstSeenCol = platform === 'indep' ? 'first_seen_date' : 'first_seen';
    const selectCols = platform === 'indep' ? `site,${idCol},${firstSeenCol}` : `${idCol},${firstSeenCol}`;
    const { data, error } = await supabase
      .from(view)
      .select(selectCols)
      .gte(firstSeenCol, from)
      .lte(firstSeenCol, to)
      .order(firstSeenCol, { ascending: true })
      .limit(limit);
    if (error) throw error;

    const items = (data||[]).map(r => {
      const first = r[firstSeenCol];
      const id = platform === 'indep' ? `https://${r.site}${r[idCol]}` : r[idCol];
      return {
        product_id: id,
        first_seen: first,
        first_seen_mmdd: toMMDD(first)
      };
    });

    res.status(200).json({ ok:true, platform, range:{from,to}, new_count: items.length, items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, msg:e.message });
  }
};

