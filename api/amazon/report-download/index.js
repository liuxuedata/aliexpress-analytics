import crypto from 'crypto';
import zlib from 'zlib';

// Amazon SP-API helper
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

  async getAccessToken() {
    if (this.accessToken && this.accessTokenExpiry && Date.now() < this.accessTokenExpiry) {
      return this.accessToken;
    }

    const response = await fetch('https://api.amazon.com/auth/o2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
    this.accessTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken;
  }

  async getDocumentInfo(documentId) {
    const accessToken = await this.getAccessToken();
    const resp = await fetch(`https://sellingpartnerapi-${this.appRegion}.amazon.com/reports/2021-06-30/documents/${documentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-amz-access-token': accessToken,
      },
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Failed to get document info: ${resp.status} ${error}`);
    }

    return await resp.json();
  }

  async downloadDocument(documentInfo) {
    const accessToken = await this.getAccessToken();
    const resp = await fetch(documentInfo.url, {
      method: 'GET',
      headers: { 'x-amz-access-token': accessToken },
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Failed to download document: ${resp.status} ${error}`);
    }

    const encrypted = Buffer.from(await resp.arrayBuffer());
    const key = Buffer.from(documentInfo.encryptionDetails.key, 'base64');
    const iv = Buffer.from(documentInfo.encryptionDetails.initializationVector, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    if (documentInfo.compressionAlgorithm === 'GZIP') {
      decrypted = zlib.gunzipSync(decrypted);
    }
    return decrypted.toString('utf8');
  }
}

function parseTsv(tsv, marketplaceId) {
  const lines = tsv.trim().split(/\r?\n/);
  if (lines.length === 0) return [];
  const headers = lines[0].split('\t');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const obj = {};
    headers.forEach((h, idx) => { obj[h.trim()] = (cols[idx] || '').trim(); });
    rows.push({
      marketplace_id: marketplaceId,
      asin: obj.ASIN || obj.asin || obj.childAsin || obj.child_asin || '',
      stat_date: obj.Date || obj.date || obj.stat_date || '',
      sessions: Number(obj.Sessions || obj.sessions || obj.session || 0),
      page_views: Number(obj['Page Views'] || obj.page_views || obj.pageViews || 0),
      units_ordered: Number(obj['Units Ordered'] || obj.units_ordered || obj.unitsOrdered || 0),
      ordered_product_sales: Number(obj['Ordered Product Sales'] || obj.ordered_product_sales || obj.orderedProductSales || 0),
      buy_box_pct: Number(obj['Buy Box Percentage'] || obj.buy_box_pct || obj.buyBoxPercentage || 0),
    });
  }
  return rows;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { documentId } = req.query;
  if (!documentId) {
    return res.status(400).json({ error: 'Missing documentId parameter' });
  }

  try {
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
    const info = await spApi.getDocumentInfo(documentId);
    const content = await spApi.downloadDocument(info);
    const marketplaceId = spApi.marketplaceIds[0] || '';
    const rows = parseTsv(content, marketplaceId);

    return res.status(200).json({
      ok: true,
      documentId,
      totalRows: rows.length,
      rows,
    });
  } catch (error) {
    console.error('Amazon report download error:', error);
    return res.status(500).json({
      error: 'Failed to download Amazon report',
      details: error.message,
    });
  }
}

