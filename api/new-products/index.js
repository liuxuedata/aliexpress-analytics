// /api/new-products/index.js
const { createClient } = require("@supabase/supabase-js");

function supa() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing Supabase env (SUPABASE_URL / KEY)");
  return createClient(url, key, { auth: { persistSession: false } });
}

function pad2(n) { return n < 10 ? "0" + n : "" + n; }
function toMMDD(iso) {
  const d = new Date(iso + "T00:00:00Z");
  return pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()); // "MMDD"
}

function getViewName(platform) {
  if (platform === "managed") return "managed_new_products";
  if (platform === "self") return "self_new_products";
  throw new Error("platform must be 'managed' or 'self'");
}

function getStatsTable(platform) {
  if (platform === "managed") return "managed_stats";
  if (platform === "self") return "self_stats";
  throw new Error("platform must be 'managed' or 'self'");
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, msg: "Only GET" });
  }

  const supabase = supa();

  try {
    const platform = String(req.query.platform || "").trim();
    if (!platform) throw new Error("Missing platform");
    const viewName = getViewName(platform);
    const statsTable = getStatsTable(platform);

    // 解析 from/to
    let { from, to } = req.query;
    const limit = Math.max(1, Math.min(parseInt(req.query.limit || "500", 10) || 500, 5000));

    // 没给 from/to 时，自动抓该平台“最近一期周末日”
    if (!from || !to) {
      const { data: lastRows, error: lastErr } = await supabase
        .from(statsTable)
        .select("period_end")
        .eq("period_type", "week")
        .order("period_end", { ascending: false })
        .limit(1);

      if (lastErr) throw lastErr;
      if (!lastRows || !lastRows.length) {
        return res.status(200).json({ ok: true, platform, range: null, new_count: 0, items: [] });
      }
      from = to = (lastRows[0].period_end || "").slice(0, 10); // 取 "YYYY-MM-DD"
    }

    // 查询新品（first_seen 在区间内）
    const { data, error } = await supabase
      .from(viewName)
      .select("product_id, first_seen")
      .gte("first_seen", from)
      .lte("first_seen", to)
      .order("first_seen", { ascending: true })
      .limit(limit);

    if (error) throw error;

    const items = (data || []).map(r => ({
      product_id: r.product_id,
      first_seen: r.first_seen,          // "YYYY-MM-DD"
      first_seen_mmdd: toMMDD(r.first_seen) // "MMDD"，如 "0713"
    }));

    return res.status(200).json({
      ok: true,
      platform,
      range: { from, to },
      new_count: items.length,
      items
    });

  } catch (e) {
    console.error("new-products error:", e);
    return res.status(500).json({ ok: false, msg: e.message });
  }
};
