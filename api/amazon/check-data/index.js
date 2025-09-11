import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const TABLE = process.env.AMZ_TABLE_NAME || 'amazon_daily_by_asin';
  
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.' });
  }
  
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  try {
    // 检查表是否存在
    const { data: tableCheck, error: tableError } = await supabase
      .from(TABLE)
      .select('*')
      .limit(1);
    
    if (tableError) {
      return res.status(500).json({ 
        error: 'Table access error', 
        details: tableError.message,
        table: TABLE
      });
    }
    
    // 获取总记录数
    const { count, error: countError } = await supabase
      .from(TABLE)
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      return res.status(500).json({ 
        error: 'Count error', 
        details: countError.message 
      });
    }
    
    // 获取最近的几条记录
    const { data: recentData, error: recentError } = await supabase
      .from(TABLE)
      .select('*')
      .order('stat_date', { ascending: false })
      .limit(5);
    
    if (recentError) {
      return res.status(500).json({ 
        error: 'Recent data error', 
        details: recentError.message 
      });
    }
    
    // 获取日期范围
    const { data: dateRange, error: dateError } = await supabase
      .from(TABLE)
      .select('stat_date')
      .order('stat_date', { ascending: true })
      .limit(1);
    
    const { data: latestDate, error: latestError } = await supabase
      .from(TABLE)
      .select('stat_date')
      .order('stat_date', { ascending: false })
      .limit(1);
    
    return res.status(200).json({
      ok: true,
      table: TABLE,
      totalRecords: count,
      earliestDate: dateRange?.[0]?.stat_date || null,
      latestDate: latestDate?.[0]?.stat_date || null,
      recentRecords: recentData || [],
      sampleRecord: tableCheck?.[0] || null
    });
    
  } catch (e) {
    return res.status(500).json({ 
      error: e?.message || 'Unknown error',
      stack: e?.stack 
    });
  }
}
