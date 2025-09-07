// /api/check-table-schema.js
// 检查数据库表结构和schema状态
const { createClient } = require('@supabase/supabase-js');

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
}

export default async function handler(req, res) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getClient();
    
    // 获取要检查的表名（默认为统一表）
    const tableName = req.query.table || 'independent_facebook_ads_daily';
    
    // 检查表是否存在 - 使用原生SQL查询
    const { data: tableExists, error: tableError } = await supabase
      .rpc('exec_sql', {
        sql: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${tableName}'`
      });

    if (tableError) {
      console.error('检查表存在性失败:', tableError);
      return res.status(500).json({ error: 'Failed to check table existence', details: tableError.message });
    }

    if (!tableExists || tableExists.length === 0) {
      return res.status(404).json({ 
        error: 'Table not found', 
        message: `${tableName} table does not exist`,
        suggestion: 'Please create the table first'
      });
    }

    // 检查表结构 - 使用原生SQL查询
    const { data: columns, error: columnError } = await supabase
      .rpc('exec_sql', {
        sql: `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${tableName}' ORDER BY ordinal_position`
      });

    if (columnError) {
      console.error('检查表结构失败:', columnError);
      return res.status(500).json({ error: 'Failed to check table structure', details: columnError.message });
    }

    // 检查关键字段是否存在
    const columnNames = columns.map(col => col.column_name);
    const hasInsertedAt = columnNames.includes('inserted_at');
    const hasUpdatedAt = columnNames.includes('updated_at');
    const hasSite = columnNames.includes('site');
    const hasDay = columnNames.includes('day');
    const hasCampaignName = columnNames.includes('campaign_name');
    const hasAdsetName = columnNames.includes('adset_name');

    // 检查约束 - 使用原生SQL查询
    const { data: constraints, error: constraintError } = await supabase
      .rpc('exec_sql', {
        sql: `SELECT constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = '${tableName}'`
      });

    if (constraintError) {
      console.error('检查约束失败:', constraintError);
    }

    // 检查索引 - 使用原生SQL查询
    const { data: indexes, error: indexError } = await supabase
      .rpc('exec_sql', {
        sql: `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = '${tableName}' AND schemaname = 'public'`
      });

    if (indexError) {
      console.error('检查索引失败:', indexError);
    }

    // 检查数据
    const { data: sampleData, error: dataError } = await supabase
      .from(tableName)
      .select('*')
      .limit(5);

    if (dataError) {
      console.error('检查数据失败:', dataError);
    }

    return res.status(200).json({
      tableExists: true,
      tableName: 'independent_facebook_ads_daily',
      columns: columns,
      columnCount: columns.length,
      keyFields: {
        inserted_at: hasInsertedAt,
        updated_at: hasUpdatedAt,
        site: hasSite,
        day: hasDay,
        campaign_name: hasCampaignName,
        adset_name: hasAdsetName
      },
      constraints: constraints || [],
      indexes: indexes || [],
      sampleData: sampleData || [],
      dataCount: sampleData ? sampleData.length : 0,
      allFieldsPresent: hasInsertedAt && hasUpdatedAt && hasSite && hasDay && hasCampaignName && hasAdsetName
    });

  } catch (error) {
    console.error('检查表schema错误:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}
