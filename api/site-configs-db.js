const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async (req, res) => {
  try {
    console.log('开始从数据库获取站点配置...');
    
    // 直接从数据库查询站点配置
    const { data, error } = await supabase
      .from('site_configs')
      .select('*')
      .order('platform', { ascending: true })
      .order('display_name', { ascending: true });
    
    if (error) {
      console.error('数据库查询错误:', error);
      throw error;
    }
    
    console.log('数据库查询成功，站点数量:', data?.length || 0);
    
    // 如果没有数据，返回默认配置
    if (!data || data.length === 0) {
      console.log('数据库中没有站点配置，返回默认配置');
      const defaultSites = [
        // 速卖通自运营站点
        { id: 'ae_self_operated_a', platform: 'ae_self_operated', name: '自运营robot站', display_name: '自运营robot站' },
        { id: 'ae_self_operated_poolslab', platform: 'ae_self_operated', name: 'poolslab', display_name: 'Poolslab运动娱乐' },
        // 独立站站点
        { id: 'independent_poolsvacuum', platform: 'independent', name: 'poolsvacuum', display_name: 'poolsvacuum.com' },
        { id: 'independent_icyberite', platform: 'independent', name: 'icyberite', display_name: 'icyberite.com' }
      ];
      
      return res.json({
        ok: true,
        data: defaultSites,
        source: 'default'
      });
    }
    
    return res.json({
      ok: true,
      data: data,
      source: 'database'
    });
    
  } catch (error) {
    console.error('站点配置API错误:', error);
    return res.status(500).json({
      ok: false,
      error: error.message,
      source: 'error'
    });
  }
};
