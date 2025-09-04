const { createClient } = require('@supabase/supabase-js');

function supa() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  return createClient(url, key, { auth: { persistSession: false } });
}

module.exports = async (req, res) => {
  try {
    const supabase = supa();
    const to = req.query.to || new Date().toISOString().slice(0,10);
    const from = req.query.from || (() => {
      const d = new Date(to);
      d.setDate(d.getDate() - 90);
      return d.toISOString().slice(0,10);
    })();

    let { data, error } = await supabase
      .from('managed_stats')
      .select('period_end, uv, add_to_cart_users, add_people, pay_buyers, pay_items, pay_people')
      .eq('period_type', 'day')
      .gte('period_end', from)
      .lte('period_end', to)
      .order('period_end', { ascending: true });
    if (error || !data || !data.length) {
      const resp = await supabase
        .from('managed_stats')
        .select('period_end, uv, add_to_cart_users, add_people, pay_buyers, pay_items, pay_people')
        .eq('period_type', 'week')
        .gte('period_end', from)
        .lte('period_end', to)
        .order('period_end', { ascending: true });
      if (resp.error) throw resp.error;
      data = resp.data || [];
    }

    const map = {};
    (data || []).forEach(r => {
      const d = r.period_end;
      if (!map[d]) map[d] = { uv:0, add:0, pay:0 };
      map[d].uv += +r.uv || 0;
      const addUsers = r.add_to_cart_users ?? r.add_people ?? 0;
      const payUsers = r.pay_buyers ?? r.pay_people ?? r.pay_items ?? 0;
      map[d].add += +addUsers || 0;
      map[d].pay += +payUsers || 0;
    });

    const rows = Object.keys(map).sort().map(d => ({
      period_end: d,
      uv_total: map[d].uv,
      add_total: map[d].add,
      pay_total: map[d].pay
    }));

    res.status(200).json({ ok: true, rows });
  } catch (e) {
    console.error('daily-totals-error', e);
    res.status(500).json({ ok: false, msg: e.message });
  }
};
