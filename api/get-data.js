// 文件路径: api/get-data.js
import { createClient } from '@supabase/supabase-js';

// 确保在 Vercel 环境变量中配置了这些变量
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 从 product_ranking 表中查询所有数据，并按统计时间降序排列
    const { data, error } = await supabase
      .from('product_ranking')
      .select('*')
      .order('统计时间', { ascending: false });

    if (error) {
      console.error('Supabase fetch error:', error);
      return res.status(500).json({ error: 'Failed to fetch data from the database.' });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
