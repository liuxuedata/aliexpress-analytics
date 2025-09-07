// /api/test-site-configs.js
// 测试站点配置API的简单端点
import { createClient } from '@supabase/supabase-js';

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
}

export default async function handler(req, res) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // 处理OPTIONS请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('测试站点配置API - 开始');
    
    // 检查环境变量
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    
    console.log('环境变量检查:', {
      hasUrl: !!url,
      hasKey: !!key,
      urlLength: url ? url.length : 0,
      keyLength: key ? key.length : 0
    });
    
    if (!url || !key) {
      return res.status(500).json({ 
        error: 'Missing environment variables',
        hasUrl: !!url,
        hasKey: !!key
      });
    }

    const supabase = getClient();
    console.log('Supabase客户端创建成功');

    // 测试数据库连接
    const { data: sites, error: sitesError } = await supabase
      .from('site_configs')
      .select('*')
      .order('created_at', { ascending: false });

    console.log('数据库查询结果:', {
      hasData: !!sites,
      dataLength: sites ? sites.length : 0,
      hasError: !!sitesError,
      error: sitesError ? sitesError.message : null
    });

    if (sitesError) {
      return res.status(500).json({ 
        error: 'Database query failed',
        details: sitesError.message
      });
    }

    // 检查特定站点
    const robotSite = sites ? sites.find(site => site.id === 'ae_self_operated_a') : null;
    console.log('Robot站点检查:', {
      found: !!robotSite,
      site: robotSite ? {
        id: robotSite.id,
        name: robotSite.name,
        platform: robotSite.platform,
        display_name: robotSite.display_name
      } : null
    });

    return res.status(200).json({
      ok: true,
      message: '测试成功',
      data: {
        totalSites: sites ? sites.length : 0,
        robotSiteExists: !!robotSite,
        robotSite: robotSite ? {
          id: robotSite.id,
          name: robotSite.name,
          platform: robotSite.platform,
          display_name: robotSite.display_name
        } : null,
        allSites: sites ? sites.map(site => ({
          id: site.id,
          name: site.name,
          platform: site.platform,
          display_name: site.display_name
        })) : []
      }
    });

  } catch (error) {
    console.error('测试站点配置API - 错误:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      stack: error.stack
    });
  }
}
