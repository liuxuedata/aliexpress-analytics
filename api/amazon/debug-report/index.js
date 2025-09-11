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
    // 检查表结构 - 使用Supabase的RPC或者直接查询表
    let tableInfo = [];
    try {
      // 尝试直接查询表来获取结构信息
      const { data: sampleData, error: sampleError } = await supabase
        .from(TABLE)
        .select('*')
        .limit(1);
      
      if (!sampleError && sampleData && sampleData.length > 0) {
        // 从样本数据推断表结构
        tableInfo = Object.keys(sampleData[0]).map(key => ({
          column_name: key,
          data_type: typeof sampleData[0][key],
          is_nullable: 'YES'
        }));
      }
    } catch (e) {
      console.log('Could not get table structure:', e.message);
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
