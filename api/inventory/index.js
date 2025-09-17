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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const supabase = getClient();
    const { method } = req;

    switch (method) {
      case 'GET':
        return await getInventory(req, res, supabase);
      case 'POST':
        return await createInventory(req, res, supabase);
      case 'PUT':
        return await updateInventory(req, res, supabase);
      case 'DELETE':
        return await deleteInventory(req, res, supabase);
      default:
        return res.status(405).json({ 
          success: false, 
          message: 'Method not allowed' 
        });
    }
  } catch (error) {
    console.error('Inventory API Error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
}

async function getInventory(req, res, supabase) {
  const { 
    site_id, 
    product_id,
    sku,
    low_stock = false,
    page = 1, 
    limit = 50,
    order_by = 'last_updated',
    order_direction = 'desc'
  } = req.query;
  
  const offset = (page - 1) * limit;
  
  let query = supabase
    .from('inventory')
    .select(`
      *,
      products:product_id (
        id,
        sku,
        name,
        description,
        brand,
        category_id,
        categories:category_id (
          id,
          name
        )
      )
    `)
    .order(order_by, { ascending: order_direction === 'asc' });
    
  // 应用筛选条件
  if (site_id) query = query.eq('site_id', site_id);
  if (product_id) query = query.eq('product_id', product_id);
  if (sku) query = query.eq('products.sku', sku);
  if (low_stock === 'true') {
    query = query.lt('available_qty', supabase.raw('min_stock_level'));
  }
  
  // 分页
  query = query.range(offset, offset + limit - 1);
  
  const { data, error, count } = await query;
  
  if (error) {
    console.error('Get inventory error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch inventory',
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
        'product_id', 'site_id', 'available_qty', 'reserved_qty', 
        'min_stock_level', 'max_stock_level', 'cost_price', 'selling_price'
      ],
      missingFields: []
    }
  });
}

async function createInventory(req, res, supabase) {
  const {
    product_id,
    site_id,
    available_qty = 0,
    reserved_qty = 0,
    min_stock_level = 0,
    max_stock_level = 0,
    cost_price,
    selling_price
  } = req.body;

  // 验证必填字段
  if (!product_id || !site_id) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: product_id, site_id'
    });
  }

  // 检查产品是否存在
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id, sku, name')
    .eq('id', product_id)
    .single();

  if (productError || !product) {
    return res.status(400).json({
      success: false,
      message: 'Product not found'
    });
  }

  // 检查库存记录是否已存在
  const { data: existingInventory, error: checkError } = await supabase
    .from('inventory')
    .select('id')
    .eq('product_id', product_id)
    .eq('site_id', site_id)
    .single();

  if (existingInventory) {
    return res.status(400).json({
      success: false,
      message: 'Inventory record already exists for this product and site'
    });
  }

  try {
    const { data, error } = await supabase
      .from('inventory')
      .insert({
        product_id,
        site_id,
        available_qty,
        reserved_qty,
        min_stock_level,
        max_stock_level,
        cost_price,
        selling_price
      })
      .select(`
        *,
        products:product_id (
          id,
          sku,
          name,
          description,
          brand
        )
      `)
      .single();

    if (error) {
      console.error('Create inventory error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create inventory record',
        error: error.message
      });
    }

    // 记录库存变动
    await supabase
      .from('inventory_movements')
      .insert({
        product_id,
        site_id,
        movement_type: 'in',
        quantity: available_qty,
        reference_type: 'initial',
        notes: 'Initial inventory setup'
      });

    return res.status(201).json({
      success: true,
      data,
      message: 'Inventory record created successfully'
    });

  } catch (error) {
    console.error('Create inventory transaction error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create inventory record',
      error: error.message
    });
  }
}

async function updateInventory(req, res, supabase) {
  const { id } = req.query;
  const updateData = req.body;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: 'Inventory ID is required'
    });
  }

  // 移除不允许更新的字段
  delete updateData.id;
  delete updateData.created_at;
  delete updateData.product_id; // 产品ID不允许修改
  delete updateData.site_id; // 站点ID不允许修改

  // 获取当前库存记录
  const { data: currentInventory, error: currentError } = await supabase
    .from('inventory')
    .select('*')
    .eq('id', id)
    .single();

  if (currentError || !currentInventory) {
    return res.status(404).json({
      success: false,
      message: 'Inventory record not found'
    });
  }

  try {
    const { data, error } = await supabase
      .from('inventory')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        products:product_id (
          id,
          sku,
          name,
          description,
          brand
        )
      `)
      .single();

    if (error) {
      console.error('Update inventory error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update inventory record',
        error: error.message
      });
    }

    // 如果可用库存发生变化，记录库存变动
    if (updateData.available_qty !== undefined && 
        updateData.available_qty !== currentInventory.available_qty) {
      const quantityChange = updateData.available_qty - currentInventory.available_qty;
      const movementType = quantityChange > 0 ? 'in' : 'out';
      
      await supabase
        .from('inventory_movements')
        .insert({
          product_id: currentInventory.product_id,
          site_id: currentInventory.site_id,
          movement_type,
          quantity: Math.abs(quantityChange),
          reference_type: 'adjustment',
          notes: `Inventory adjustment: ${quantityChange > 0 ? '+' : ''}${quantityChange}`
        });
    }

    return res.json({
      success: true,
      data,
      message: 'Inventory record updated successfully'
    });

  } catch (error) {
    console.error('Update inventory transaction error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update inventory record',
      error: error.message
    });
  }
}

async function deleteInventory(req, res, supabase) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: 'Inventory ID is required'
    });
  }

  // 检查库存记录是否存在
  const { data: existingInventory, error: checkError } = await supabase
    .from('inventory')
    .select('id, available_qty, reserved_qty')
    .eq('id', id)
    .single();

  if (checkError || !existingInventory) {
    return res.status(404).json({
      success: false,
      message: 'Inventory record not found'
    });
  }

  // 检查是否有预留库存
  if (existingInventory.reserved_qty > 0) {
    return res.status(400).json({
      success: false,
      message: 'Cannot delete inventory record with reserved stock'
    });
  }

  // 删除库存记录
  const { error } = await supabase
    .from('inventory')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Delete inventory error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete inventory record',
      error: error.message
    });
  }

  return res.json({
    success: true,
    message: 'Inventory record deleted successfully'
  });
}
