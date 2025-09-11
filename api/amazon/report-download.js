import { createReadStream } from 'fs';
import { createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';

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

  // 下载报表文档
  async downloadReportDocument(documentId) {
    const accessToken = await this.getAccessToken();
    
    // 首先获取文档下载URL
    const docResponse = await fetch(`https://sellingpartnerapi-${this.appRegion}.amazon.com/reports/2021-06-30/documents/${documentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-amz-access-token': accessToken,
      },
    });

    if (!docResponse.ok) {
      const error = await docResponse.text();
      throw new Error(`Failed to get document info: ${docResponse.status} ${error}`);
    }

    const docInfo = await docResponse.json();
    const downloadUrl = docInfo.url;

    // 下载文档内容
    const downloadResponse = await fetch(downloadUrl);
    if (!downloadResponse.ok) {
      throw new Error(`Failed to download document: ${downloadResponse.status}`);
    }

    return await downloadResponse.text();
  }

  // 解析报表数据
  parseReportData(rawData) {
    const lines = rawData.trim().split('\n');
    if (lines.length < 2) {
      return [];
    }

    // 第一行是表头
    const headers = lines[0].split('\t');
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split('\t');
      if (values.length !== headers.length) continue;

      const row = {};
      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = values[j];
      }
      rows.push(row);
    }

    return rows;
  }

  // 转换Amazon数据格式为我们的数据库格式
  transformToDbFormat(rows) {
    return rows.map(row => {
      // Amazon Sales & Traffic Report 字段映射
      const asin = row['parentAsin'] || row['childAsin'] || '';
      const marketplaceId = row['marketplaceId'] || '';
      const statDate = row['date'] || '';
      
      // 提取数值字段
      const sessions = parseInt(row['sessions'] || '0', 10);
      const pageViews = parseInt(row['pageViews'] || '0', 10);
      const unitsOrdered = parseInt(row['orderedProductSalesUnits'] || '0', 10);
      const orderedProductSales = parseFloat(row['orderedProductSalesAmount'] || '0');
      const buyBoxPct = parseFloat(row['buyBoxPercentage'] || '0');

      return {
        marketplace_id: marketplaceId,
        asin: asin,
        stat_date: statDate,
        sessions: sessions,
        page_views: pageViews,
        units_ordered: unitsOrdered,
        ordered_product_sales: orderedProductSales,
        buy_box_pct: buyBoxPct
      };
    }).filter(row => row.asin && row.stat_date && row.marketplace_id);
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
    
    // 下载并解析报表数据
    const rawData = await spApi.downloadReportDocument(documentId);
    const parsedRows = spApi.parseReportData(rawData);
    const transformedRows = spApi.transformToDbFormat(parsedRows);

    return res.status(200).json({
      ok: true,
      documentId,
      totalRows: transformedRows.length,
      rows: transformedRows
    });

  } catch (error) {
    console.error('Amazon report download error:', error);
    return res.status(500).json({ 
      error: 'Failed to download Amazon report',
      details: error.message 
    });
  }
}
