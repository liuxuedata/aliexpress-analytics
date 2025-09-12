// 本地数据同步解决方案
export default async function handler(req, res) {
  try {
    console.log('[Local Sync] Starting local data sync solution...');
    
    // 这个端点用于接收本地拉取的数据
    if (req.method === 'POST') {
      const { data, date, marketplaceId } = req.body;
      
      if (!data || !Array.isArray(data)) {
        return res.status(400).json({
          error: 'Invalid data format',
          required: 'data array, date, marketplaceId'
        });
      }
      
      console.log(`[Local Sync] Received ${data.length} records for ${date}`);
      
      // 连接到Supabase
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      
      // 转换数据格式
      const transformedData = data.map(row => ({
        marketplace_id: marketplaceId || 'ATVPDKIKX0DER',
        asin: row.asin || row.parentAsin || row.childAsin || '',
        stat_date: date || row.date || '',
        sessions: parseInt(row.sessions || '0', 10),
        page_views: parseInt(row.pageViews || '0', 10),
        units_ordered: parseInt(row.unitsOrdered || row.orderedProductSalesUnits || '0', 10),
        ordered_product_sales: parseFloat(row.orderedProductSales || row.orderedProductSalesAmount || '0'),
        buy_box_pct: parseFloat(row.buyBoxPercentage || '0'),
        session_to_order_rate: parseFloat(row.sessionToOrderRate || '0')
      })).filter(row => row.asin && row.stat_date);
      
      console.log(`[Local Sync] Transformed ${transformedData.length} valid records`);
      
      // 插入数据到数据库
      const { data: insertResult, error: insertError } = await supabase
        .from('amazon_daily_by_asin')
        .upsert(transformedData, { 
          onConflict: 'marketplace_id,asin,stat_date',
          ignoreDuplicates: false 
        });
      
      if (insertError) {
        console.error('[Local Sync] Database insert error:', insertError);
        return res.status(500).json({
          error: 'Database insert failed',
          details: insertError.message
        });
      }
      
      console.log('[Local Sync] Data inserted successfully');
      
      return res.status(200).json({
        ok: true,
        message: 'Data synced successfully',
        recordsProcessed: transformedData.length,
        date: date,
        marketplaceId: marketplaceId
      });
    }
    
    // GET请求返回同步说明
    return res.status(200).json({
      ok: true,
      message: 'Local data sync endpoint',
      usage: {
        method: 'POST',
        endpoint: '/api/amazon/local-sync',
        body: {
          data: 'Array of Amazon SP-API data',
          date: 'YYYY-MM-DD format',
          marketplaceId: 'Amazon marketplace ID (optional)'
        }
      },
      example: {
        data: [
          {
            asin: 'B123456789',
            date: '2025-01-01',
            sessions: 100,
            pageViews: 250,
            unitsOrdered: 5,
            orderedProductSales: 99.99,
            buyBoxPercentage: 0.85
          }
        ],
        date: '2025-01-01',
        marketplaceId: 'ATVPDKIKX0DER'
      },
      instructions: [
        '1. Run Amazon SP-API data pull locally',
        '2. POST the data to this endpoint',
        '3. Data will be automatically transformed and stored',
        '4. Use the frontend to view the synced data'
      ]
    });
    
  } catch (error) {
    console.error('[Local Sync] Error:', error);
    return res.status(500).json({
      error: 'Local sync failed',
      message: error.message,
      stack: error.stack
    });
  }
}
