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

    const resp = await fetch('https://api.amazon.com/auth/o2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Failed to get access token: ${resp.status} ${text}`);
    }
    const data = await resp.json();
    this.accessToken = data.access_token;
    this.accessTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken;
  }

  async getDocument(documentId) {
    const token = await this.getAccessToken();
    const resp = await fetch(`https://sellingpartnerapi-${this.appRegion}.amazon.com/reports/2021-06-30/documents/${documentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-amz-access-token': token,
      },
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Failed to get document: ${resp.status} ${text}`);
    }
    return await resp.json();
  }
}

function parseTsv(tsv) {
  const lines = tsv.trim().split(/\r?\n/);
  if (lines.length === 0) return [];
  const headers = lines.shift().split('\t');
  const rows = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = cols[i] ? cols[i].trim() : ''; });
    rows.push({
      marketplace_id: obj.marketplaceId || obj.marketplace_id || obj.marketplace || '',
      asin: obj.asin || '',
      stat_date: obj.date || obj.stat_date || obj.day || '',
      sessions: Number(obj.sessions || 0),
      page_views: Number(obj.pageViews || obj.page_views || 0),
      units_ordered: Number(obj.unitsOrdered || obj.orders || obj.units_ordered || 0),
      ordered_product_sales: Number(obj.orderedProductSales || obj.ordered_product_sales || 0),
      buy_box_pct: Number(obj.buyBoxPercentage || obj.buy_box_pct || 0),
    });
  }
  return rows;
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

    const requiredEnv = [
      'AMZ_LWA_CLIENT_ID',
      'AMZ_LWA_CLIENT_SECRET',
      'AMZ_SP_REFRESH_TOKEN',
      'AMZ_ROLE_ARN',
      'AMZ_MARKETPLACE_IDS',
    ];
    for (const k of requiredEnv) {
      if (!process.env[k]) {
        return res.status(500).json({ error: `Missing environment variable: ${k}` });
      }
    }

    const spApi = new AmazonSPAPI();
    const docInfo = await spApi.getDocument(documentId);
    if (!docInfo.url || !docInfo.encryptionDetails) {
      throw new Error('Invalid document info returned');
    }

    const encBuf = Buffer.from(await (await fetch(docInfo.url)).arrayBuffer());
    const key = Buffer.from(docInfo.encryptionDetails.key, 'base64');
    const iv = Buffer.from(docInfo.encryptionDetails.initializationVector, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(encBuf), decipher.final()]);
    const unzipped = docInfo.compressionAlgorithm === 'GZIP'
      ? zlib.gunzipSync(decrypted)
      : decrypted;
    const text = unzipped.toString('utf-8');
    const rows = parseTsv(text);

    return res.status(200).json({ ok: true, totalRows: rows.length, rows });
  } catch (err) {
    console.error('Amazon report download error:', err);
    return res.status(500).json({ error: 'Failed to download Amazon report', details: err.message });
  }
}
