// 文件路径: api/upload.js
import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';

// 确保在 Vercel 环境变量中配置了这些变量
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const csvData = req.body.csv_data;

    // 解析 CSV 数据
    const records = parse(csvData, {
      columns: true,
      skip_empty_lines: true
    });

    // 将数据插入到 Supabase，使用 onConflict 实现去重
    const { data, error } = await supabase
      .from('product_ranking')
      .upsert(records, { onConflict: '"统计时间", "商品ID"' });

    if (error) {
      console.error('Supabase upsert error:', error);
      return res.status(500).json({ error: 'Failed to upload data.' });
    }

    return res.status(200).json({ message: 'Data uploaded and de-duplicated successfully.', data });
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
