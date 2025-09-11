// 简单的API测试端点
export default async function handler(req, res) {
  try {
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
    
    // 测试query API
    const queryTest = await fetch(`${baseUrl}/api/amazon/query?start=2025-01-01&end=2025-01-02&granularity=day`)
      .then(r => ({ status: r.status, ok: r.ok, text: r.text() }))
      .catch(e => ({ error: e.message }));
    
    // 测试upsert API
    const upsertTest = await fetch(`${baseUrl}/api/amazon/upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: [] })
    })
      .then(r => ({ status: r.status, ok: r.ok, text: r.text() }))
      .catch(e => ({ error: e.message }));

    return res.status(200).json({
      baseUrl,
      queryTest,
      upsertTest,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
}
