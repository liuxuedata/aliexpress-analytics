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
        return await getUsers(req, res, supabase);
      case 'POST':
        return await createUser(req, res, supabase);
      case 'PUT':
        return await updateUser(req, res, supabase);
      case 'DELETE':
        return await deleteUser(req, res, supabase);
      default:
        return res.status(405).json({ 
          success: false, 
          message: 'Method not allowed' 
        });
    }
  } catch (error) {
    console.error('Users API Error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
}

async function getUsers(req, res, supabase) {
  const { 
    role_id,
    is_active,
    page = 1, 
    limit = 50,
    order_by = 'created_at',
    order_direction = 'desc'
  } = req.query;
  
  const offset = (page - 1) * limit;
  
  try {
    // 首先检查表是否存在
    const { data: tableCheck, error: tableError } = await supabase
      .from('users')
      .select('id')
      .limit(1);
    
    if (tableError) {
      console.error('Table check error:', tableError);
      // 如果表不存在，返回空数据而不是错误
      return res.json({
        success: true,
        data: {
          items: [],
          total: 0,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: 0
        },
        metadata: {
          availableFields: [
            'username', 'email', 'full_name', 'role_id', 'is_active', 
            'created_at', 'updated_at', 'role_info'
          ],
          missingFields: [],
          message: 'Users table not found. Please run database migration.'
        }
      });
    }
    
    let query = supabase
      .from('users')
      .select(`
        id,
        username,
        email,
        full_name,
        role_id,
        is_active,
        created_at,
        updated_at,
        roles:role_id (
          id,
          name,
          description,
          permissions
        )
      `)
      .order(order_by, { ascending: order_direction === 'asc' });
      
    // 应用筛选条件
    if (role_id) query = query.eq('role_id', role_id);
    if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');
    
    // 分页
    query = query.range(offset, offset + limit - 1);
    
    const { data, error, count } = await query;
    
    if (error) {
      console.error('Get users error:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch users',
        error: error.message 
      });
    }
    
    // 移除密码哈希字段
    const safeData = (data || []).map(user => {
      const { password_hash, ...safeUser } = user;
      return safeUser;
    });
    
    return res.json({
      success: true,
      data: {
        items: safeData,
        total: count || 0,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil((count || 0) / limit)
      },
      metadata: {
        availableFields: [
          'username', 'email', 'full_name', 'role_id', 'is_active', 
          'created_at', 'updated_at', 'role_info'
        ],
        missingFields: []
      }
    });
  } catch (error) {
    console.error('Unexpected error in getUsers:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
}

async function createUser(req, res, supabase) {
  const {
    username,
    email,
    password,
    full_name,
    role_id,
    is_active = true
  } = req.body;

  // 验证必填字段
  if (!username || !email || !password || !role_id) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: username, email, password, role_id'
    });
  }

  // 验证邮箱格式
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid email format'
    });
  }

  // 验证密码强度
  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters long'
    });
  }

  // 检查用户名是否已存在
  const { data: existingUsername, error: usernameError } = await supabase
    .from('users')
    .select('id')
    .eq('username', username)
    .single();

  if (existingUsername) {
    return res.status(400).json({
      success: false,
      message: 'Username already exists'
    });
  }

  // 检查邮箱是否已存在
  const { data: existingEmail, error: emailError } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  if (existingEmail) {
    return res.status(400).json({
      success: false,
      message: 'Email already exists'
    });
  }

  // 检查角色是否存在
  const { data: role, error: roleError } = await supabase
    .from('roles')
    .select('id, name')
    .eq('id', role_id)
    .single();

  if (roleError || !role) {
    return res.status(400).json({
      success: false,
      message: 'Role not found'
    });
  }

  try {
    // 加密密码
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    const { data, error } = await supabase
      .from('users')
      .insert({
        username,
        email,
        password_hash,
        full_name,
        role_id,
        is_active
      })
      .select(`
        id,
        username,
        email,
        full_name,
        role_id,
        is_active,
        created_at,
        updated_at,
        roles:role_id (
          id,
          name,
          description
        )
      `)
      .single();

    if (error) {
      console.error('Create user error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create user',
        error: error.message
      });
    }

    return res.status(201).json({
      success: true,
      data,
      message: 'User created successfully'
    });

  } catch (error) {
    console.error('Create user transaction error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create user',
      error: error.message
    });
  }
}

async function updateUser(req, res, supabase) {
  const { id } = req.query;
  const updateData = req.body;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: 'User ID is required'
    });
  }

  // 移除不允许更新的字段
  delete updateData.id;
  delete updateData.created_at;
  delete updateData.password_hash; // 密码需要通过专门的接口更新

  // 如果更新邮箱，验证格式
  if (updateData.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(updateData.email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // 检查邮箱是否已被其他用户使用
    const { data: existingEmail, error: emailError } = await supabase
      .from('users')
      .select('id')
      .eq('email', updateData.email)
      .neq('id', id)
      .single();

    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }
  }

  // 如果更新用户名，检查是否已被其他用户使用
  if (updateData.username) {
    const { data: existingUsername, error: usernameError } = await supabase
      .from('users')
      .select('id')
      .eq('username', updateData.username)
      .neq('id', id)
      .single();

    if (existingUsername) {
      return res.status(400).json({
        success: false,
        message: 'Username already exists'
      });
    }
  }

  // 如果更新角色，检查角色是否存在
  if (updateData.role_id) {
    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('id, name')
      .eq('id', updateData.role_id)
      .single();

    if (roleError || !role) {
      return res.status(400).json({
        success: false,
        message: 'Role not found'
      });
    }
  }

  const { data, error } = await supabase
    .from('users')
    .update(updateData)
    .eq('id', id)
    .select(`
      id,
      username,
      email,
      full_name,
      role_id,
      is_active,
      created_at,
      updated_at,
      roles:role_id (
        id,
        name,
        description
      )
    `)
    .single();

  if (error) {
    console.error('Update user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: error.message
    });
  }

  if (!data) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  return res.json({
    success: true,
    data,
    message: 'User updated successfully'
  });
}

async function deleteUser(req, res, supabase) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: 'User ID is required'
    });
  }

  // 检查用户是否存在
  const { data: existingUser, error: checkError } = await supabase
    .from('users')
    .select('id, username, role_id')
    .eq('id', id)
    .single();

  if (checkError || !existingUser) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  // 检查是否是超级管理员
  const { data: role, error: roleError } = await supabase
    .from('roles')
    .select('name')
    .eq('id', existingUser.role_id)
    .single();

  if (role && role.name === 'super_admin') {
    return res.status(400).json({
      success: false,
      message: 'Cannot delete super admin user'
    });
  }

  // 软删除：将用户设置为非活跃状态
  const { error } = await supabase
    .from('users')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    console.error('Delete user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error: error.message
    });
  }

  return res.json({
    success: true,
    message: 'User deactivated successfully'
  });
}
