import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      message: 'Method not allowed' 
    });
  }

  try {
    const supabase = getClient();
    
    // 创建测试数据
    await createTestData(supabase);
    
    return res.json({
      success: true,
      message: 'Test data created successfully'
    });
    
  } catch (error) {
    console.error('Test data creation error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to create test data',
      error: error.message 
    });
  }
}

async function createTestData(supabase) {
  console.log('Creating test data...');
  
  // 1. 创建角色数据
  const roles = [
    {
      id: 'super_admin',
      name: 'super_admin',
      description: '超级管理员',
      permissions: {
        analytics: ['read', 'write'],
        orders: ['read', 'write'],
        inventory: ['read', 'write'],
        ads: ['read', 'write'],
        users: ['read', 'write']
      }
    },
    {
      id: 'operations_manager',
      name: 'operations_manager',
      description: '运营管理员',
      permissions: {
        analytics: ['read', 'write'],
        orders: ['read', 'write'],
        inventory: ['read'],
        ads: ['read', 'write'],
        users: ['read']
      }
    },
    {
      id: 'order_manager',
      name: 'order_manager',
      description: '订单管理员',
      permissions: {
        analytics: ['read'],
        orders: ['read', 'write'],
        inventory: ['read'],
        ads: ['read'],
        users: ['read']
      }
    }
  ];

  for (const role of roles) {
    const { error } = await supabase
      .from('roles')
      .upsert(role, { onConflict: 'id' });
    
    if (error) {
      console.error('Error creating role:', role.name, error);
    } else {
      console.log('Created role:', role.name);
    }
  }

  // 2. 创建用户数据
  const users = [
    {
      id: 'admin-001',
      username: 'admin',
      email: 'admin@example.com',
      full_name: '系统管理员',
      role_id: 'super_admin',
      is_active: true,
      password_hash: await bcrypt.hash('admin123', 10)
    },
    {
      id: 'user-001',
      username: 'demo',
      email: 'demo@example.com',
      full_name: '演示用户',
      role_id: 'operations_manager',
      is_active: true,
      password_hash: await bcrypt.hash('demo123', 10)
    }
  ];

  for (const user of users) {
    const { error } = await supabase
      .from('users')
      .upsert(user, { onConflict: 'id' });
    
    if (error) {
      console.error('Error creating user:', user.username, error);
    } else {
      console.log('Created user:', user.username);
    }
  }

  // 3. 创建站点数据
  const sites = [
    {
      id: 'site-001',
      name: '速卖通全托管',
      platform: 'aliexpress',
      url: 'https://aliexpress.com',
      is_active: true
    },
    {
      id: 'site-002',
      name: '自运营站点',
      platform: 'independent',
      url: 'https://mysite.com',
      is_active: true
    }
  ];

  for (const site of sites) {
    const { error } = await supabase
      .from('sites')
      .upsert(site, { onConflict: 'id' });
    
    if (error) {
      console.error('Error creating site:', site.name, error);
    } else {
      console.log('Created site:', site.name);
    }
  }

  // 4. 创建产品数据
  const products = [
    {
      id: 'prod-001',
      name: '测试产品1',
      sku: 'TEST-001',
      category: '电子产品',
      site_id: 'site-001',
      is_active: true
    },
    {
      id: 'prod-002',
      name: '测试产品2',
      sku: 'TEST-002',
      category: '服装',
      site_id: 'site-002',
      is_active: true
    }
  ];

  for (const product of products) {
    const { error } = await supabase
      .from('products')
      .upsert(product, { onConflict: 'id' });
    
    if (error) {
      console.error('Error creating product:', product.name, error);
    } else {
      console.log('Created product:', product.name);
    }
  }

  // 5. 创建订单数据
  const orders = [
    {
      id: 'order-001',
      order_number: 'ORD-001',
      site_id: 'site-001',
      customer_email: 'customer1@example.com',
      total: 99.99,
      status: 'completed',
      order_date: new Date().toISOString()
    },
    {
      id: 'order-002',
      order_number: 'ORD-002',
      site_id: 'site-002',
      customer_email: 'customer2@example.com',
      total: 149.99,
      status: 'pending',
      order_date: new Date().toISOString()
    }
  ];

  for (const order of orders) {
    const { error } = await supabase
      .from('orders')
      .upsert(order, { onConflict: 'id' });
    
    if (error) {
      console.error('Error creating order:', order.order_number, error);
    } else {
      console.log('Created order:', order.order_number);
    }
  }

  console.log('Test data creation completed!');
}
