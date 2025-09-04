// /api/stats/index.js
const { createClient } = require("@supabase/supabase-js");

function supa() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  return createClient(url, key, { auth: { persistSession: false } });
}

function fmtDate(d) {
  const y = d.getFullYear();
  const m = ("0" + (d.getMonth() + 1)).slice(-2);
  const day = ("0" + d.getDate()).slice(-2);
  return `${y}-${m}-${day}`;
}
function lastWeekEnd() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = d.getDay(); // 0 = Sun
  d.setDate(d.getDate() - (day + 7)); // 上上周日（“上一完整周”的周末）
  return fmtDate(d);
}
function lastMonthEnd() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), 0); // 上个月最后一天
  return fmtDate(d);
}

module.exports = async (req, res) => {
  try {
    const supabase = supa();
    const gran = (req.query.granularity || "week").toLowerCase(); // 'week' | 'month'
    const pid = req.query.product_id;

    if (pid) {
      const from = req.query.from || "2000-01-01";
      const to = req.query.to || fmtDate(new Date());
      const { data, error } = await supabase
        .from("managed_stats")
        .select("*")
        .eq("period_type", gran)
        .eq("product_id", pid)
        .gte("period_end", from)
        .lte("period_end", to)
        .order("period_end", { ascending: true });
      if (error) throw error;
      return res.status(200).json({ ok: true, rows: data, granularity: gran });
    }

    let periodEnd = req.query.period_end || (gran === "week" ? lastWeekEnd() : lastMonthEnd());

    // 若该周期无数据，最多向前找 8 个周期
    let found = null;
    for (let i = 0; i < 8; i++) {
      const { data, error } = await supabase
        .from("managed_stats")
        .select("product_id")
        .eq("period_type", gran)
        .eq("period_end", periodEnd)
        .limit(1);

      if (error) throw error;

      if (data && data.length) {
        found = periodEnd;
        break;
      }
      const d = new Date(periodEnd);
      if (gran === "week") {
        d.setDate(d.getDate() - 7);
      } else {
        d.setMonth(d.getMonth() - 1);
        // 确保是该月月末
        d.setDate(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate());
      }
      periodEnd = fmtDate(d);
    }

    if (!found) {
      return res.status(200).json({ ok: true, kpis: null, rows: [], period_end: null, granularity: gran });
    }

    const limit = Math.min(parseInt(req.query.limit,10) || 1000, 1000);
    const offset = parseInt(req.query.offset,10) || 0;

    const { data: rows, count, error: e2 } = await supabase
      .from("managed_stats")
      .select("*", { count: "exact" })
      .eq("period_type", gran)
      .eq("period_end", found)
      .order('product_id', { ascending: true })
      .range(offset, offset + limit - 1);

    if (e2) throw e2;

    // —— 计算 KPI —— //
    const num = v => Number(v ?? 0) || 0;
    const sum = (arr, k) => arr.reduce((s, r) => s + num(r[k]), 0);

    const prodCount = rows.length;
    const atcProd = rows.filter(r => num(r.add_to_cart_qty) > 0 || num(r.add_to_cart_users) > 0).length;
    const payProd = rows.filter(r => num(r.pay_items) > 0 || num(r.pay_orders) > 0).length;

    const visitorTotal = sum(rows, "uv"); // 访客数字段：uv
    const addUsersTotal = sum(rows, "add_to_cart_users");
    const payBuyersTotal = sum(rows, "pay_buyers");

    // 曝光优先级：search_exposure -> exposure -> pv(兜底)
    const exposureSum = (() => {
      const s1 = sum(rows, "search_exposure");
      if (s1 > 0) return s1;
      const s2 = sum(rows, "exposure");
      if (s2 > 0) return s2;
      return sum(rows, "pv"); // 没有曝光就兜底用浏览量，避免 KPI 恒为 0
    })();

    const visitToAtcRate = visitorTotal > 0 ? (addUsersTotal / visitorTotal) * 100 : 0;
    const atcToPayRate = addUsersTotal > 0 ? (payBuyersTotal / addUsersTotal) * 100 : 0;
    const visitRate = exposureSum > 0 ? (visitorTotal / exposureSum) * 100 : 0; // “平均访客比”

    const kpis = {
      avg_visit_to_atc: +visitToAtcRate.toFixed(2),
      avg_atc_to_pay: +atcToPayRate.toFixed(2),
      avg_visit_rate: +visitRate.toFixed(2),
      product_count: prodCount,
      atc_product_count: atcProd,
      pay_product_count: payProd,
      visitor_total: visitorTotal,
      exposure_total: exposureSum,
      add_user_total: addUsersTotal,
      pay_buyers_total: payBuyersTotal
    };

    return res.status(200).json({ ok: true, kpis, rows, total: count || rows.length, granularity: gran, period_end: found });
  } catch (e) {
    console.error("stats-error:", e);
    return res.status(500).json({ ok: false, msg: e.message });
  }
};

