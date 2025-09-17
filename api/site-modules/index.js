import { createClient } from '@supabase/supabase-js';

function getClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

export default async function handler(req, res) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const supabase = getClient();
    const { method } = req;

    switch (method) {
      case 'GET':
        return await getSiteModules(req, res, supabase);
      case 'POST':
        return await createSiteModule(req, res, supabase);
      case 'PATCH':
        return await updateSiteModule(req, res, supabase);
      case 'DELETE':
        return await deleteSiteModule(req, res, supabase);
      default:
        return res.status(405).json({ 
          success: false, 
          message: 'Method not allowed' 
        });
    }
  } catch (error) {
    console.error('Site Modules API Error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
}

async function getSiteModules(req, res, supabase) {
  const { 
    site_id,
    platform,
    module_key,
    enabled,
    is_global,
    page = 1, 
    limit = 100,
    order_by = 'nav_order',
    order_direction = 'asc'
  } = req.query;
  
  const offset = (page - 1) * limit;
  
  let query = supabase
    .from('site_module_configs')
    .select('*')
    .order(order_by, { ascending: order_direction === 'asc' });
    
  // 应用筛选条件
  if (site_id) query = query.eq('site_id', site_id);
  if (platform) query = query.eq('platform', platform);
  if (module_key) query = query.eq('module_key', module_key);
  if (enabled !== undefined) query = query.eq('enabled', enabled === 'true');
  if (is_global !== undefined) query = query.eq('is_global', is_global === 'true');
  
  // 分页
  query = query.range(offset, offset + limit - 1);
  
  const { data, error, count } = await query;
  
  if (error) {
    console.error('Get site modules error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch site modules',
      error: error.message 
    });
  }
  
  return res.json({
    success: true,
    data: {
      items: data || [],
      total: count || 0,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil((count || 0) / limit)
    },
    metadata: {
      availableFields: [
        'site_id', 'platform', 'module_key', 'nav_label', 'nav_order', 
        'enabled', 'is_global', 'has_data_source', 'visible_roles', 'config'
      ],
      missingFields: []
    }
  });
}

async function createSiteModule(req, res, supabase) {
  const {
    site_id,
    platform,
    module_key,
    nav_label,
    nav_order = 0,
    enabled = true,
    is_global = false,
    has_data_source = false,
    visible_roles = [],
    config = {}
  } = req.body;

  // 验证必填字段
  if (!platform || !module_key || !nav_label) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: platform, module_key, nav_label'
    });
  }

  // 验证模块键
  const validModuleKeys = ['operations', 'products', 'orders', 'advertising', 'inventory', 'permissions'];
  if (!validModuleKeys.includes(module_key)) {
    return res.status(400).json({
      success: false,
      message: `Invalid module_key. Must be one of: ${validModuleKeys.join(', ')}`
    });
  }

  // 检查模块配置是否已存在
  const { data: existingModule, error: checkError } = await supabase
    .from('site_module_configs')
    .select('id')
    .eq('platform', platform)
    .eq('module_key', module_key)
    .eq('site_id', site_id || null)
    .single();

  if (existingModule) {
    return res.status(400).json({
      success: false,
      message: 'Module configuration already exists for this site/platform/module combination'
    });
  }

  try {
    const { data, error } = await supabase
      .from('site_module_configs')
      .insert({
        site_id,
        platform,
        module_key,
        nav_label,
        nav_order,
        enabled,
        is_global,
        has_data_source,
        visible_roles,
        config
      })
      .select()
      .single();

    if (error) {
      console.error('Create site module error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create site module configuration',
        error: error.message
      });
    }

    return res.status(201).json({
      success: true,
      data,
      message: 'Site module configuration created successfully'
    });

  } catch (error) {
    console.error('Create site module transaction error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create site module configuration',
      error: error.message
    });
  }
}

async function updateSiteModule(req, res, supabase) {
  const { id } = req.query;
  const updateData = req.body;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: 'Module configuration ID is required'
    });
  }

  // 移除不允许更新的字段
  delete updateData.id;
  delete updateData.created_at;
  delete updateData.platform; // 平台不允许修改
  delete updateData.module_key; // 模块键不允许修改

  // 如果更新模块键，验证有效性
  if (updateData.module_key) {
    const validModuleKeys = ['operations', 'products', 'orders', 'advertising', 'inventory', 'permissions'];
    if (!validModuleKeys.includes(updateData.module_key)) {
      return res.status(400).json({
        success: false,
        message: `Invalid module_key. Must be one of: ${validModuleKeys.join(', ')}`
      });
    }
  }

  const { data, error } = await supabase
    .from('site_module_configs')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Update site module error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update site module configuration',
      error: error.message
    });
  }

  if (!data) {
    return res.status(404).json({
      success: false,
      message: 'Site module configuration not found'
    });
  }

  return res.json({
    success: true,
    data,
    message: 'Site module configuration updated successfully'
  });
}

async function deleteSiteModule(req, res, supabase) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: 'Module configuration ID is required'
    });
  }

  // 检查模块配置是否存在
  const { data: existingModule, error: checkError } = await supabase
    .from('site_module_configs')
    .select('id, module_key, is_global')
    .eq('id', id)
    .single();

  if (checkError || !existingModule) {
    return res.status(404).json({
      success: false,
      message: 'Site module configuration not found'
    });
  }

  // 检查是否是全局核心模块
  if (existingModule.is_global && ['inventory', 'permissions'].includes(existingModule.module_key)) {
    return res.status(400).json({
      success: false,
      message: 'Cannot delete global core modules (inventory, permissions)'
    });
  }

  // 删除模块配置
  const { error } = await supabase
    .from('site_module_configs')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Delete site module error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete site module configuration',
      error: error.message
    });
  }

  return res.json({
    success: true,
    message: 'Site module configuration deleted successfully'
  });
}
