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
    const site = String(req.query.site||"").trim(); // 新增：站点参数
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

    // managed_new_products 视图不包含 site 列
    const hasSite = platform !== 'managed';
    const selectCols = hasSite ? `site,${idCol},${firstSeenCol}` : `${idCol},${firstSeenCol}`;

    let query = supabase
      .from(view)
      .select(selectCols)
      .gte(firstSeenCol, from)
      .lte(firstSeenCol, to);

    // 仅在视图包含 site 列时才应用站点过滤
    if (hasSite && site) {
      query = query.eq('site', site);
    }
    
    let { data, error } = await query
      .order(firstSeenCol, { ascending: true })
      .limit(limit);
    
    // 如果视图不存在，尝试创建视图或使用直接查询
    if (error && error.message && error.message.includes('relation') && error.message.includes('does not exist')) {
      console.log(`View ${view} does not exist, attempting to create it or use direct query`);
      
      if (platform === 'managed') {
        // 对于全托管平台，直接查询 managed_stats 表
        const { data: directData, error: directError } = await supabase
          .from('managed_stats')
          .select('product_id, period_end')
          .gte('period_end', from)
          .lte('period_end', to)
          .order('period_end', { ascending: true })
          .limit(limit);
        
        if (directError) throw directError;
        
        // 手动计算首次出现日期
        const productFirstSeen = new Map();
        (directData || []).forEach(row => {
          const existing = productFirstSeen.get(row.product_id);
          if (!existing || row.period_end < existing) {
            productFirstSeen.set(row.product_id, row.period_end);
          }
        });
        
        data = Array.from(productFirstSeen.entries()).map(([product_id, first_seen]) => ({
          product_id,
          first_seen
        }));
        error = null;
      } else {
        throw error; // 对于其他平台，仍然抛出错误
      }
    } else if (error) {
      throw error;
    }

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

