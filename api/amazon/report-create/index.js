import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

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

  // 创建报表请求
  async createReport(reportType, dataStartTime, dataEndTime) {
    const accessToken = await this.getAccessToken();
    
    const requestBody = {
      reportType,
      dataStartTime,
      dataEndTime,
      marketplaceIds: this.marketplaceIds,
    };

    const url = `https://sellingpartnerapi-${this.appRegion}.amazon.com/reports/2021-06-30/reports`;
    console.log(`[SP-API] Creating report at: ${url}`);
    console.log(`[SP-API] Request body:`, JSON.stringify(requestBody, null, 2));
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'x-amz-access-token': accessToken,
        },
        body: JSON.stringify(requestBody),
      });

      console.log(`[SP-API] Response status: ${response.status}`);
      
      if (!response.ok) {
        const error = await response.text();
        console.error(`[SP-API] Error response:`, error);
        throw new Error(`Failed to create report: ${response.status} ${error}`);
      }

      const result = await response.json();
      console.log(`[SP-API] Success response:`, result);
      return result;
    } catch (fetchError) {
      console.error(`[SP-API] Fetch error:`, fetchError);
      throw new Error(`Fetch failed: ${fetchError.message}`);
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { dataStartTime, dataEndTime } = req.body;
    
    if (!dataStartTime || !dataEndTime) {
      return res.status(400).json({ error: 'Missing dataStartTime or dataEndTime' });
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
    
    // 创建 Sales & Traffic by ASIN 报表
    const reportType = 'GET_SALES_AND_TRAFFIC_REPORT';
    const result = await spApi.createReport(reportType, dataStartTime, dataEndTime);

    return res.status(200).json({
      ok: true,
      reportId: result.reportId,
      reportType: result.reportType,
      processingStatus: result.processingStatus,
      dataStartTime,
      dataEndTime
    });

  } catch (error) {
    console.error('Amazon report creation error:', error);
    return res.status(500).json({ 
      error: 'Failed to create Amazon report',
      details: error.message 
    });
  }
}
