const { createClient } = require("@supabase/supabase-js");

function supa() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, msg: "Only POST" });
  }

  try {
    const supabase = supa();
    
    // 创建 managed_new_products 视图
    const createManagedViewQuery = `
      CREATE OR REPLACE VIEW public.managed_new_products AS
      SELECT 
          product_id,
          MIN(period_end) as first_seen
      FROM public.managed_stats
      WHERE search_exposure > 0 OR uv > 0
      GROUP BY product_id
      ORDER BY first_seen;
    `;

    const { error: managedError } = await supabase.rpc('exec_sql', { sql: createManagedViewQuery });
    
    if (managedError) {
      console.error('Error creating managed_new_products view:', managedError);
      return res.status(500).json({ ok: false, error: managedError.message });
    }

    // 验证视图是否创建成功
    const { data: managedData, error: managedCheckError } = await supabase
      .from('managed_new_products')
      .select('product_id')
      .limit(1);

    if (managedCheckError) {
      console.error('Error checking managed_new_products view:', managedCheckError);
      return res.status(500).json({ ok: false, error: managedCheckError.message });
    }

    // 获取视图中的记录数
    const { count: managedCount, error: managedCountError } = await supabase
      .from('managed_new_products')
      .select('*', { count: 'exact', head: true });

    if (managedCountError) {
      console.error('Error counting managed_new_products:', managedCountError);
      return res.status(500).json({ ok: false, error: managedCountError.message });
    }

    return res.status(200).json({
      ok: true,
      message: "Views created successfully",
      managed_new_products: {
        created: true,
        record_count: managedCount || 0
      }
    });

  } catch (e) {
    console.error("create-views error:", e);
    return res.status(500).json({ ok: false, msg: e.message });
  }
};
