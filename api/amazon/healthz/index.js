
export default async function handler(req, res) {
  const env = {
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    AMZ_LWA_CLIENT_ID: !!process.env.AMZ_LWA_CLIENT_ID,
    AMZ_LWA_CLIENT_SECRET: !!process.env.AMZ_LWA_CLIENT_SECRET,
    AMZ_SP_REFRESH_TOKEN: !!process.env.AMZ_SP_REFRESH_TOKEN,
    AMZ_ROLE_ARN: !!process.env.AMZ_ROLE_ARN,
    AMZ_APP_REGION: !!process.env.AMZ_APP_REGION,
    AMZ_MARKETPLACE_IDS: !!process.env.AMZ_MARKETPLACE_IDS,
  };
  res.status(200).json({ ok: Object.values(env).every(Boolean), env });
}
