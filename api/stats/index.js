
const { createClient } = require("@supabase/supabase-js");

function supa(){
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY, { auth:{persistSession:false} });
}

function fmtDate(d){ const y=d.getFullYear(); const m=('0'+(d.getMonth()+1)).slice(-2); const day=('0'+d.getDate()).slice(-2); return `${y}-${m}-${day}`; }
function lastWeekEnd(){
  const now = new Date(); // default: previous Sunday
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = d.getDay(); // 0 Sun
  const delta = day + 7;  // go back to last Sunday of previous week
  d.setDate(d.getDate() - delta);
  return fmtDate(d);
}
function lastMonthEnd(){
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), 0); // last day of previous month
  return fmtDate(d);
}

module.exports = async (req, res) => {
  try{
    const supabase = supa();
    const gran = (req.query.granularity||"week").toLowerCase(); // 'week' or 'month'
    let periodEnd = req.query.period_end || (gran === "week" ? lastWeekEnd() : lastMonthEnd());

    // fallback: if no data for this period, step back up to 8 periods
    let found = null;
    for (let i=0;i<8;i++){
      const { data, error } = await supabase
        .from("managed_stats")
        .select("*, product_id")
        .eq("period_type", gran)
        .eq("period_end", periodEnd)
        .limit(1);
      if (error) throw error;
      if (data && data.length){
        found = periodEnd;
        break;
      }
      // step back
      const d = new Date(periodEnd);
      if (gran === "week"){
        d.setDate(d.getDate() - 7);
      } else {
        d.setMonth(d.getMonth()-1);
        d.setDate(0 + new Date(d.getFullYear(), d.getMonth()+1, 0).getDate()); // ensure month-end
      }
      periodEnd = fmtDate(d);
    }
    if (!found) return res.status(200).json({ ok:true, kpis:null, rows:[], period_end:null });

    // fetch rows for found period
    const { data: rows, error: e2 } = await supabase
      .from("managed_stats")
      .select("*")
      .eq("period_type", gran)
      .eq("period_end", found);
    if (e2) throw e2;

    // KPIs
    const sum = (arr,k)=> arr.reduce((s,x)=> s + (Number(x[k]||0)), 0);
    const prodCount = rows.length;
    const atcProd = rows.filter(x=> Number(x.add_to_cart_qty||0) > 0 || Number(x.add_to_cart_users||0) > 0 ).length;
    const payProd = rows.filter(x=> Number(x.pay_items||0) > 0 || Number(x.pay_orders||0) > 0 ).length;
    const visitorTotal = sum(rows,"uv");
    const visitToAtcRate = visitorTotal ? (sum(rows,"add_to_cart_users")/visitorTotal*100) : 0;
    const atcToPayRate = sum(rows,"add_to_cart_users") ? (sum(rows,"pay_buyers")/sum(rows,"add_to_cart_users")*100) : 0;
    const visitRate = sum(rows,"pv") ? (visitorTotal / sum(rows,"pv") * 100) : 0;

    const kpis = {
      avg_visit_to_atc: +visitToAtcRate.toFixed(2),
      avg_atc_to_pay: +atcToPayRate.toFixed(2),
      avg_visit_rate: +visitRate.toFixed(2),
      product_count: prodCount,
      atc_product_count: atcProd,
      pay_product_count: payProd,
      visitor_total: visitorTotal
    };

    return res.status(200).json({ ok:true, kpis, rows, granularity: gran, period_end: found });
  } catch(e){
    return res.status(500).json({ ok:false, msg: e.message });
  }
};
