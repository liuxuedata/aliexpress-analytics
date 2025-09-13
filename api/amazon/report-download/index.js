import crypto from 'crypto';
import zlib from 'zlib';

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

  // 获取报表文档信息
  async getReportDocument(documentId) {
    const accessToken = await this.getAccessToken();

    const response = await fetch(`https://sellingpartnerapi-${this.appRegion}.amazon.com/reports/2021-06-30/documents/${documentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-amz-access-token': accessToken,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get report document: ${response.status} ${error}`);
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
    const { documentId } = req.query;
    if (!documentId) {
      return res.status(400).json({ error: 'Missing documentId parameter' });
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
    const docInfo = await spApi.getReportDocument(documentId);

    const downloadRes = await fetch(docInfo.url);
    if (!downloadRes.ok) {
      const error = await downloadRes.text();
      throw new Error(`Failed to download report document: ${downloadRes.status} ${error}`);
    }
    const encryptedBuffer = Buffer.from(await downloadRes.arrayBuffer());

    const key = Buffer.from(docInfo.encryptionDetails.key, 'base64');
    const iv = Buffer.from(docInfo.encryptionDetails.initializationVector, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);

    let output = decrypted;
    if (docInfo.compressionAlgorithm === 'GZIP') {
      output = zlib.gunzipSync(decrypted);
    }

    const text = output.toString('utf-8');
    try {
      const json = JSON.parse(text);
      return res.status(200).json({ ok: true, documentId, rows: json });
    } catch (e) {
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(text);
    }

  } catch (error) {
    console.error('Amazon report download error:', error);
    return res.status(500).json({
      error: 'Failed to download Amazon report',
      details: error.message
    });
  }
}

