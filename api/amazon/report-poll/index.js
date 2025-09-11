// Amazon SP-API 认证和请求工具
class AmazonSPAPI {
  constructor() {
    this.clientId = process.env.AMZ_LWA_CLIENT_ID;
    this.clientSecret = process.env.AMZ_LWA_CLIENT_SECRET;
    this.refreshToken = process.env.AMZ_SP_REFRESH_TOKEN;
    this.roleArn = process.env.AMZ_ROLE_ARN;
    this.appRegion = process.env.AMZ_APP_REGION || 'us-east-1';
    this.marketplaceIds = (process.env.AMZ_MARKETPLACE_IDS || '').split(',').filter(Boolean);
    this.accessToken = null;
    this.accessTokenExpiry = null;
  }

  // 获取访问令牌
  async getAccessToken() {
    if (this.accessToken && this.accessTokenExpiry && Date.now() < this.accessTokenExpiry) {
      return this.accessToken;
    }

    const response = await fetch('https://api.amazon.com/auth/o2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get access token: ${response.status} ${error}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.accessTokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // 提前1分钟过期
    return this.accessToken;
  }

  // 查询报表状态
  async getReport(reportId) {
    const accessToken = await this.getAccessToken();
    
    const response = await fetch(`https://sellingpartnerapi-${this.appRegion}.amazon.com/reports/2021-06-30/reports/${reportId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-amz-access-token': accessToken,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get report: ${response.status} ${error}`);
    }

    return await response.json();
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { reportId } = req.query;
    
    if (!reportId) {
      return res.status(400).json({ error: 'Missing reportId parameter' });
    }

    // 验证环境变量
    const requiredEnvVars = [
      'AMZ_LWA_CLIENT_ID',
      'AMZ_LWA_CLIENT_SECRET', 
      'AMZ_SP_REFRESH_TOKEN',
      'AMZ_ROLE_ARN',
      'AMZ_MARKETPLACE_IDS'
    ];

    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        return res.status(500).json({ error: `Missing environment variable: ${envVar}` });
      }
    }

    const spApi = new AmazonSPAPI();
    const result = await spApi.getReport(reportId);

    return res.status(200).json({
      ok: true,
      reportId: result.reportId,
      reportType: result.reportType,
      processingStatus: result.processingStatus,
      documentId: result.documentId || null,
      createdTime: result.createdTime,
      processingStartTime: result.processingStartTime,
      processingEndTime: result.processingEndTime
    });

  } catch (error) {
    console.error('Amazon report polling error:', error);
    return res.status(500).json({ 
      error: 'Failed to poll Amazon report',
      details: error.message 
    });
  }
}

