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
        return await getOrders(req, res, supabase);
      case 'POST':
        return await createOrder(req, res, supabase);
      case 'PUT':
        return await updateOrder(req, res, supabase);
      case 'DELETE':
        return await deleteOrder(req, res, supabase);
      default:
        return res.status(405).json({ 
          success: false, 
          message: 'Method not allowed' 
        });
    }
  } catch (error) {
    console.error('Orders API Error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
}

async function getOrders(req, res, supabase) {
  const { 
    site_id, 
    status, 
    date_from, 
    date_to, 
    page = 1, 
    limit = 50,
    order_by = 'placed_at',
    order_direction = 'desc'
  } = req.query;
  
  const offset = (page - 1) * limit;
  
  let query = supabase
    .from('orders')
    .select(`
      *,
      customers:customer_id (
        id,
        email,
        phone,
        country,
        city
      ),
      order_items (
        id,
        sku,
        product_name,
        quantity,
        unit_price,
        total_price
      )
    `)
    .order(order_by, { ascending: order_direction === 'asc' });
    
  // 应用筛选条件
  if (site_id) query = query.eq('site_id', site_id);
  if (status) query = query.eq('status', status);
  if (date_from) query = query.gte('placed_at', date_from);
  if (date_to) query = query.lte('placed_at', date_to);
  
  // 分页
  query = query.range(offset, offset + limit - 1);
  
  const { data, error, count } = await query;
  
  if (error) {
    console.error('Get orders error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch orders',
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
        'order_no', 'site_id', 'platform', 'status', 'placed_at', 
        'total', 'currency', 'customer_info', 'order_items'
      ],
      missingFields: []
    }
  });
}

async function createOrder(req, res, supabase) {
  const {
    order_no,
    site_id,
    platform,
    channel,
    customer_id,
    status = 'pending',
    currency = 'USD',
    subtotal = 0,
    discount = 0,
    shipping_fee = 0,
    tax = 0,
    total,
    cost_of_goods = 0,
    logistics_cost = 0,
    warehouse_id,
    remark = {},
    order_items = []
  } = req.body;

  // 验证必填字段
  if (!order_no || !site_id || !platform) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: order_no, site_id, platform'
    });
  }

  // 计算总金额
  const calculatedTotal = subtotal - discount + shipping_fee + tax;
  const finalTotal = total || calculatedTotal;

  try {
    // 开始事务
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_no,
        site_id,
        platform,
        channel,
        customer_id,
        status,
        currency,
        subtotal,
        discount,
        shipping_fee,
        tax,
        total: finalTotal,
        cost_of_goods,
        logistics_cost,
        warehouse_id,
        remark
      })
      .select()
      .single();

    if (orderError) {
      console.error('Create order error:', orderError);
      return res.status(500).json({
        success: false,
        message: 'Failed to create order',
        error: orderError.message
      });
    }

    // 插入订单明细
    if (order_items && order_items.length > 0) {
      const itemsWithOrderId = order_items.map(item => ({
        ...item,
        order_id: order.id
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(itemsWithOrderId);

      if (itemsError) {
        console.error('Create order items error:', itemsError);
        // 回滚订单创建
        await supabase.from('orders').delete().eq('id', order.id);
        return res.status(500).json({
          success: false,
          message: 'Failed to create order items',
          error: itemsError.message
        });
      }
    }

    return res.status(201).json({
      success: true,
      data: order,
      message: 'Order created successfully'
    });

  } catch (error) {
    console.error('Create order transaction error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message
    });
  }
}

async function updateOrder(req, res, supabase) {
  const { id } = req.query;
  const updateData = req.body;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: 'Order ID is required'
    });
  }

  // 移除不允许更新的字段
  delete updateData.id;
  delete updateData.created_at;
  delete updateData.order_no; // 订单号不允许修改

  const { data, error } = await supabase
    .from('orders')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Update order error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update order',
      error: error.message
    });
  }

  if (!data) {
    return res.status(404).json({
      success: false,
      message: 'Order not found'
    });
  }

  return res.json({
    success: true,
    data,
    message: 'Order updated successfully'
  });
}

async function deleteOrder(req, res, supabase) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: 'Order ID is required'
    });
  }

  // 检查订单是否存在
  const { data: existingOrder, error: checkError } = await supabase
    .from('orders')
    .select('id, status')
    .eq('id', id)
    .single();

  if (checkError || !existingOrder) {
    return res.status(404).json({
      success: false,
      message: 'Order not found'
    });
  }

  // 检查订单状态，只有pending状态的订单可以删除
  if (existingOrder.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: 'Only pending orders can be deleted'
    });
  }

  // 删除订单（级联删除订单明细）
  const { error } = await supabase
    .from('orders')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Delete order error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete order',
      error: error.message
    });
  }

  return res.json({
    success: true,
    message: 'Order deleted successfully'
  });
}
