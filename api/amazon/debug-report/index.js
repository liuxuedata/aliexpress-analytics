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
    // 检查表结构
    const { data: tableInfo, error: tableError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable')
      .eq('table_name', TABLE);
    
    if (tableError) {
      return res.status(500).json({ 
        error: 'Failed to get table info', 
        details: tableError.message 
      });
    }
    
    // 检查是否有数据
    const { data: sampleData, error: dataError } = await supabase
      .from(TABLE)
      .select('*')
      .limit(3);
    
    if (dataError) {
      return res.status(500).json({ 
        error: 'Failed to get sample data', 
        details: dataError.message 
      });
    }
    
    // 检查最近的数据
    const { data: recentData, error: recentError } = await supabase
      .from(TABLE)
      .select('*')
      .order('stat_date', { ascending: false })
      .limit(5);
    
    return res.status(200).json({
      ok: true,
      table: TABLE,
      tableStructure: tableInfo || [],
      sampleData: sampleData || [],
      recentData: recentData || [],
      totalRecords: sampleData?.length || 0,
      hasData: (sampleData?.length || 0) > 0
    });
    
  } catch (e) {
    return res.status(500).json({ 
      error: e?.message || 'Unknown error',
      stack: e?.stack 
    });
  }
}
