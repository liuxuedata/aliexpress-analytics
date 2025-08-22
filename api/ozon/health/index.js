export default async function handler(req, res) {
  const env = {
    OZON_CLIENT_ID: !!process.env.OZON_CLIENT_ID,
    OZON_API_KEY: !!process.env.OZON_API_KEY,
  };
  res.status(200).json({ ok: env.OZON_CLIENT_ID && env.OZON_API_KEY, env });
}
