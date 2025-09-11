// 简单的API测试端点
export default async function handler(req, res) {
  try {
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
    
    // 测试query API
    const queryResponse = await fetch(`${baseUrl}/api/amazon/query?start=2025-01-01&end=2025-01-02&granularity=day`);
    const queryText = await queryResponse.text();
    const queryTest = {
      status: queryResponse.status,
      ok: queryResponse.ok,
      text: queryText,
      isJson: false
    };
    
    try {
      const queryJson = JSON.parse(queryText);
      queryTest.isJson = true;
      queryTest.json = queryJson;
    } catch (e) {
      queryTest.parseError = e.message;
    }
    
    // 测试upsert API
    const upsertResponse = await fetch(`${baseUrl}/api/amazon/upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: [] })
    });
    const upsertText = await upsertResponse.text();
    const upsertTest = {
      status: upsertResponse.status,
      ok: upsertResponse.ok,
      text: upsertText,
      isJson: false
    };
    
    try {
      const upsertJson = JSON.parse(upsertText);
      upsertTest.isJson = true;
      upsertTest.json = upsertJson;
    } catch (e) {
      upsertTest.parseError = e.message;
    }

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
