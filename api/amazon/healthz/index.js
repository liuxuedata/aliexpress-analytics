export default async function handler(req, res) {
  const keys = [
    "AMZ_LWA_CLIENT_ID",
    "AMZ_LWA_CLIENT_SECRET",
    "AMZ_SP_REFRESH_TOKEN",
    "AMZ_ROLE_ARN",
    "AMZ_APP_REGION",
    "AMZ_MARKETPLACE_IDS",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];

  const envStatus = {};
  for (const k of keys) {
    const val = process.env[k];
    if (val && val.length > 0) {
      // 显示前 3 位 + ... + 后 3 位，中间打码
      const masked =
        val.length > 10
          ? `${val.slice(0, 3)}...${val.slice(-3)}`
          : `${val[0]}...${val[val.length - 1]}`;
      envStatus[k] = { ok: true, preview: masked };
    } else {
      envStatus[k] = { ok: false, preview: null };
    }
  }

  res.status(200).json({
    ok: Object.values(envStatus).every((x) => x.ok),
    env: envStatus,
    time: new Date().toISOString(),
  });
}
