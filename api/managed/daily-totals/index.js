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

    async function fetch(period, userField) {
      return supabase
        .from('managed_stats')
        .select(`period_end, uv, ${userField}, pay_buyers, pay_items, pay_people`)
        .eq('period_type', period)
        .gte('period_end', from)
        .lte('period_end', to)
        .order('period_end', { ascending: true });
    }

    // 尝试优先使用新字段 add_to_cart_users
    let userField = 'add_to_cart_users';
    let { data, error } = await fetch('day', userField);
    if (error && error.code === '42703') {
      userField = 'add_people';
      ({ data, error } = await fetch('day', userField));
    }

    if (error || !data || !data.length) {
      let resp = await fetch('week', userField);
      if (resp.error && resp.error.code === '42703' && userField === 'add_to_cart_users') {
        userField = 'add_people';
        resp = await fetch('week', userField);
      }
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
