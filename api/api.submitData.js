
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const { source_code, platform, stat_date: finalStatDate, rows } = req.body || {};

    // 若未提供 stat_date，则尝试从行内推断
  let finalStatDate = stat_date;
  if (!finalStatDate) {
    const pickDate = (r) => r['统计日期'] ?? r['日期'] ?? r['date'] ?? r['stat_date'];
    const candidates = Array.from(new Set(rows.map(r => pickDate(r)).filter(Boolean).map(String)));
    if (candidates.length === 1) {
      const v = candidates[0].replace(/[-/]/g,'');
      if (/^\d{8}$/.test(v)) finalStatDate = `${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}`;
    }
  }
  if (!finalStatDate) {
    res.status(400).json({ error: 'stat_date required (无法从文件推断日期)' });
    return;
  }

  if (!source_code || !platform || !Array.isArray(rows)) {
      res.status(400).json({ error: 'source_code/platform/stat_date/rows required' });
      return;
    }

    // 归一化并做数值兜底
    const toNum = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));

    const upserts = rows.map((r) => ({
      source_code,
      platform,
      stat_date: finalStatDate,
      product_id: String(r.product_id ?? r.productId ?? r.id ?? ''),
      exposure: toNum(r.exposure ?? r.impressions),
      visitors: toNum(r.visitors ?? r.sessions),
      views: toNum(r.views ?? r.pageviews),
      add_people: toNum(r.add_people ?? r.addPeople),
      add_count: toNum(r.add_count ?? r.addCount),
      pay_items: toNum(r.pay_items ?? r.payItems),
      pay_orders: toNum(r.pay_orders ?? r.payOrders ?? r.orders),
      pay_buyers: toNum(r.pay_buyers ?? r.payBuyers ?? r.buyers),
      visitor_to_add: toNum(r.visitor_to_add),
      add_to_pay: toNum(r.add_to_pay),
      visitor_ratio: toNum(r.visitor_ratio),
      raw: r
    })).filter(r => r.product_id); // 必须有 product_id

    if (upserts.length === 0) {
      res.status(400).json({ error: 'rows empty or missing product_id' });
      return;
    }

    const { error } = await supabase
      .from('fact_daily_metrics')
      .upsert(upserts, { onConflict: 'source_code,platform,product_id,stat_date' });

    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    res.status(200).json({ success: true, count: upserts.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message || String(e) });
  }
}
