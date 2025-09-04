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

    const { data, error } = await supabase
      .from('managed_stats')
      .select('period_end, uv, add_to_cart_users, pay_buyers, search_exposure, exposure, pv')
      .eq('period_type', 'week')
      .gte('period_end', from)
      .lte('period_end', to)
      .order('period_end', { ascending: true });
    if (error) throw error;

    const map = {};
    (data || []).forEach(r => {
      const d = r.period_end;
      if (!map[d]) map[d] = { exp:0, uv:0, add:0, pay:0 };
      const exp = r.search_exposure || r.exposure || r.pv || 0;
      map[d].exp += +exp;
      map[d].uv += +r.uv || 0;
      map[d].add += +r.add_to_cart_users || 0;
      map[d].pay += +r.pay_buyers || 0;
    });

    const rows = Object.keys(map).sort().map(d => {
      const m = map[d];
      const visitRate = m.exp > 0 ? m.uv / m.exp * 100 : 0;
      const addRate = m.uv > 0 ? m.add / m.uv * 100 : 0;
      const payRate = m.add > 0 ? m.pay / m.add * 100 : 0;
      return {
        period_end: d,
        visit_rate: +visitRate.toFixed(2),
        add_rate: +addRate.toFixed(2),
        pay_rate: +payRate.toFixed(2)
      };
    });

    res.status(200).json({ ok: true, rows });
  } catch (e) {
    console.error('ratio-trend-error', e);
    res.status(500).json({ ok: false, msg: e.message });
  }
};

