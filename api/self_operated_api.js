// File: api/self_operated_save.js

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Only POST method allowed');
  }

  const records = req.body;
  let inserted = 0;
  let skipped = 0;

  for (const record of records) {
    const { product_id, stat_date } = record;

    const { data: exists, error: queryErr } = await supabase
      .from('self_operated_data')
      .select('id')
      .eq('product_id', product_id)
      .eq('stat_date', stat_date)
      .maybeSingle();

    if (exists) {
      skipped++;
      continue;
    }

    const { error: insertErr } = await supabase
      .from('self_operated_data')
      .insert(record);

    if (insertErr) {
      console.error('Insert failed:', insertErr);
    } else {
      inserted++;
    }
  }

  // ✅ 新增：上传完成后直接返回当前数据库的所有记录
  const { data: allData, error: fetchErr } = await supabase
    .from('self_operated_data')
    .select('*')
    .order('stat_date', { ascending: false })
    .order('product_id');

  if (fetchErr) {
    return res.status(500).json({ inserted, skipped, error: fetchErr.message });
  }

  return res.status(200).json({ inserted, skipped, data: allData });
}
