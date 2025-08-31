// /api/site-sync/index.js
// 站点同步API - 同步数据库中的站点信息
const { createClient } = require('@supabase/supabase-js');

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
}

export default async function handler(req, res) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // 处理OPTIONS请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  console.log('站点同步API请求信息:', {
    method: req.method,
    url: req.url,
    body: req.body
  });
  
  const { siteId, oldSiteId, action } = req.body;
  
  if (!siteId || !action) {
    return res.status(400).json({ error: 'Site ID and action are required' });
  }
  
  const supabase = getClient();
  
  try {
    // 获取站点配置信息
    const { data: siteConfig, error: siteError } = await supabase
      .from('site_configs')
      .select('*')
      .eq('id', siteId)
      .single();
    
    if (siteError || !siteConfig) {
      throw new Error('Site configuration not found');
    }
    
    console.log('同步站点信息:', { siteId, oldSiteId, action, siteConfig });
    
    if (action === 'update') {
      // 更新站点配置 - 需要同步数据库中的站点标识
      console.log('更新站点配置:', { siteId, oldSiteId, siteConfig });
      
      // 如果站点ID没有变化，但站点名称可能变化了
      // 我们需要确保数据库中的site字段与站点ID一致
      
      // 更新 ae_self_operated_daily 表中的站点标识
      // 使用站点ID作为site字段的值，而不是站点名称
      const { error: updateError } = await supabase
        .from('ae_self_operated_daily')
        .update({ site: siteId })
        .eq('site', oldSiteId || siteConfig.name || siteConfig.display_name);
      
      if (updateError) {
        console.error('更新ae_self_operated_daily表失败:', updateError);
        // 不抛出错误，因为可能没有匹配的记录
        console.log('可能没有需要更新的记录，继续执行');
      } else {
        console.log('成功更新ae_self_operated_daily表中的站点标识');
      }
      
      // 同时更新其他可能使用站点名称的表
      // 例如：如果有其他表也使用站点标识，也需要更新
      const tablesToUpdate = ['ae_self_operated_daily']; // 可以扩展其他表
      
      for (const tableName of tablesToUpdate) {
        try {
          const { error: tableUpdateError } = await supabase
            .from(tableName)
            .update({ site: siteId })
            .eq('site', siteConfig.name || siteConfig.display_name);
          
          if (!tableUpdateError) {
            console.log(`成功更新${tableName}表中的站点标识`);
          }
        } catch (e) {
          console.log(`更新${tableName}表时出错:`, e.message);
        }
      }
    }
    
    // 如果是新建站点，确保数据表存在
    if (action === 'create' && siteConfig.platform === 'independent') {
      console.log('为新建的独立站创建数据表');
      
      // 调用动态表生成函数
      const { error: tableError } = await supabase.rpc('generate_dynamic_table', {
        p_site_id: siteId,
        p_table_name: `independent_${siteConfig.name}_daily`,
        p_table_schema: siteConfig.config_json || {}
      });
      
      if (tableError) {
        console.error('创建动态表失败:', tableError);
        // 不抛出错误，因为表可能已经存在
      } else {
        console.log('成功创建动态表');
      }
    }
    
    return res.status(200).json({
      ok: true,
      message: 'Site synchronization completed successfully',
      siteId: siteId,
      action: action
    });
    
  } catch (error) {
    console.error('站点同步错误:', error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
