// /api/test.js
// 简单的测试API
export default async function handler(req, res) {
  return res.status(200).json({
    ok: true,
    message: 'API is working',
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString()
  });
}
