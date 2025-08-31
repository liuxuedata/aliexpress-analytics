// /api/data-source-templates/index.js
// 数据源模板管理API
const { createClient } = require('@supabase/supabase-js');

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
}

export default async function handler(req, res) {
  const supabase = getClient();

  try {
    switch (req.method) {
      case 'GET':
        // 获取数据源模板列表
        const { data: templates, error: templatesError } = await supabase
          .from('data_source_templates')
          .select('*')
          .order('created_at', { ascending: false });

        if (templatesError) throw templatesError;

        return res.status(200).json({
          ok: true,
          data: templates
        });

      case 'POST':
        // 创建新数据源模板
        const { id, name, platform, source_type, fields_json, sample_file } = req.body;

        // 验证必填字段
        if (!id || !name || !platform || !source_type || !fields_json) {
          return res.status(400).json({
            ok: false,
            error: 'Missing required fields: id, name, platform, source_type, fields_json'
          });
        }

        // 检查模板是否已存在
        const { data: existingTemplate } = await supabase
          .from('data_source_templates')
          .select('id')
          .eq('id', id)
          .single();

        if (existingTemplate) {
          return res.status(400).json({
            ok: false,
            error: 'Template already exists with this ID'
          });
        }

        // 插入新模板
        const { data: newTemplate, error: insertError } = await supabase
          .from('data_source_templates')
          .insert({
            id,
            name,
            platform,
            source_type,
            fields_json,
            sample_file
          })
          .select()
          .single();

        if (insertError) throw insertError;

        return res.status(201).json({
          ok: true,
          data: newTemplate
        });

      default:
        return res.status(405).json({
          ok: false,
          error: 'Method not allowed'
        });
    }
  } catch (error) {
    console.error('Data source templates API error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
