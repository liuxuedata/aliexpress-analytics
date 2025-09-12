#!/usr/bin/env node

/**
 * Amazon SP-API 本地数据拉取脚本
 * 用于在本地环境拉取Amazon数据，然后同步到云端数据库
 */

import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// 配置
const CONFIG = {
  // Amazon SP-API 配置
  clientId: process.env.AMZ_LWA_CLIENT_ID,
  clientSecret: process.env.AMZ_LWA_CLIENT_SECRET,
  refreshToken: process.env.AMZ_SP_REFRESH_TOKEN,
  appRegion: process.env.AMZ_APP_REGION || 'us-east-1',
  marketplaceIds: (process.env.AMZ_MARKETPLACE_IDS || '').split(',').filter(Boolean),
  
  // Supabase 配置
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  
  // 同步配置
  syncUrl: process.env.SYNC_URL || 'https://your-domain.vercel.app/api/amazon/local-sync',
  
  // 数据拉取配置
  reportType: 'GET_SALES_AND_TRAFFIC_REPORT',
  daysToPull: 7, // 拉取最近7天的数据
};

class AmazonDataPuller {
  constructor() {
    this.accessToken = null;
    this.supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
  }

  // 获取LWA访问令牌
  async getAccessToken() {
    if (this.accessToken) {
      return this.accessToken;
    }

    console.log('🔐 获取LWA访问令牌...');
    
    const response = await fetch('https://api.amazon.com/auth/o2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: CONFIG.refreshToken,
        client_id: CONFIG.clientId,
        client_secret: CONFIG.clientSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`LWA认证失败: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    console.log('✅ LWA访问令牌获取成功');
    
    return this.accessToken;
  }

  // 创建报表请求
  async createReport(dataStartTime, dataEndTime) {
    const accessToken = await this.getAccessToken();
    
    const requestBody = {
      reportType: CONFIG.reportType,
      dataStartTime,
      dataEndTime,
      marketplaceIds: CONFIG.marketplaceIds,
    };

    const url = `https://sellingpartnerapi-${CONFIG.appRegion}.amazon.com/reports/2021-06-30/reports`;
    console.log(`📊 创建报表请求: ${dataStartTime} 到 ${dataEndTime}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'x-amz-access-token': accessToken,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`报表创建失败: ${response.status} ${await response.text()}`);
    }

    const result = await response.json();
    console.log(`✅ 报表创建成功，ID: ${result.reportId}`);
    
    return result.reportId;
  }

  // 轮询报表状态
  async pollReportStatus(reportId) {
    const accessToken = await this.getAccessToken();
    
    console.log(`⏳ 轮询报表状态: ${reportId}`);
    
    while (true) {
      const response = await fetch(`https://sellingpartnerapi-${CONFIG.appRegion}.amazon.com/reports/2021-06-30/reports/${reportId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-amz-access-token': accessToken,
        },
      });

      if (!response.ok) {
        throw new Error(`报表状态查询失败: ${response.status} ${await response.text()}`);
      }

      const result = await response.json();
      console.log(`📋 报表状态: ${result.processingStatus}`);

      if (result.processingStatus === 'DONE') {
        console.log('✅ 报表处理完成');
        return result.documentId;
      } else if (result.processingStatus === 'FATAL') {
        throw new Error('报表处理失败');
      }

      // 等待30秒后重试
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }

  // 下载报表数据
  async downloadReport(documentId) {
    const accessToken = await this.getAccessToken();
    
    console.log(`📥 下载报表数据: ${documentId}`);
    
    const response = await fetch(`https://sellingpartnerapi-${CONFIG.appRegion}.amazon.com/reports/2021-06-30/documents/${documentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-amz-access-token': accessToken,
      },
    });

    if (!response.ok) {
      throw new Error(`报表下载失败: ${response.status} ${await response.text()}`);
    }

    const data = await response.text();
    console.log(`✅ 报表数据下载成功，大小: ${data.length} 字符`);
    
    return data;
  }

  // 解析报表数据
  parseReportData(rawData) {
    console.log('🔄 解析报表数据...');
    
    const lines = rawData.split('\n').filter(line => line.trim());
    if (lines.length === 0) {
      throw new Error('报表数据为空');
    }

    // 解析表头
    const headers = lines[0].split('\t');
    console.log(`📋 报表列数: ${headers.length}`);
    console.log(`📋 报表行数: ${lines.length - 1}`);

    // 解析数据行
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split('\t');
      const row = {};
      
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      
      rows.push(row);
    }

    console.log(`✅ 数据解析完成，共 ${rows.length} 条记录`);
    return rows;
  }

  // 同步数据到云端
  async syncToCloud(data, date, marketplaceId) {
    console.log(`☁️ 同步数据到云端: ${data.length} 条记录`);
    
    const response = await fetch(CONFIG.syncUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data,
        date,
        marketplaceId: marketplaceId || CONFIG.marketplaceIds[0]
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`云端同步失败: ${response.status} ${error}`);
    }

    const result = await response.json();
    console.log(`✅ 云端同步成功: ${result.recordsProcessed} 条记录`);
    
    return result;
  }

  // 拉取单日数据
  async pullSingleDayData(date) {
    try {
      console.log(`\n🚀 开始拉取 ${date} 的数据...`);
      
      const dataStartTime = `${date}T00:00:00.000Z`;
      const dataEndTime = `${date}T23:59:59.999Z`;
      
      // 1. 创建报表
      const reportId = await this.createReport(dataStartTime, dataEndTime);
      
      // 2. 轮询报表状态
      const documentId = await this.pollReportStatus(reportId);
      
      // 3. 下载报表数据
      const rawData = await this.downloadReport(documentId);
      
      // 4. 解析数据
      const parsedData = this.parseReportData(rawData);
      
      // 5. 同步到云端
      await this.syncToCloud(parsedData, date);
      
      console.log(`✅ ${date} 数据拉取完成`);
      return parsedData;
      
    } catch (error) {
      console.error(`❌ ${date} 数据拉取失败:`, error.message);
      throw error;
    }
  }

  // 拉取多日数据
  async pullMultipleDaysData() {
    console.log(`\n🎯 开始拉取最近 ${CONFIG.daysToPull} 天的数据...`);
    
    const results = [];
    const today = new Date();
    
    for (let i = 1; i <= CONFIG.daysToPull; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      try {
        const data = await this.pullSingleDayData(dateStr);
        results.push({ date: dateStr, success: true, records: data.length });
      } catch (error) {
        results.push({ date: dateStr, success: false, error: error.message });
      }
      
      // 避免请求过于频繁
      if (i < CONFIG.daysToPull) {
        console.log('⏳ 等待5秒后继续...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    console.log('\n📊 数据拉取总结:');
    results.forEach(result => {
      if (result.success) {
        console.log(`✅ ${result.date}: ${result.records} 条记录`);
      } else {
        console.log(`❌ ${result.date}: ${result.error}`);
      }
    });
    
    return results;
  }
}

// 主函数
async function main() {
  try {
    console.log('🚀 Amazon SP-API 本地数据拉取器启动...');
    
    // 检查环境变量
    const requiredEnvVars = [
      'AMZ_LWA_CLIENT_ID',
      'AMZ_LWA_CLIENT_SECRET', 
      'AMZ_SP_REFRESH_TOKEN',
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY'
    ];
    
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      throw new Error(`缺少环境变量: ${missingVars.join(', ')}`);
    }
    
    console.log('✅ 环境变量检查通过');
    
    // 创建拉取器实例
    const puller = new AmazonDataPuller();
    
    // 拉取数据
    const results = await puller.pullMultipleDaysData();
    
    console.log('\n🎉 数据拉取完成！');
    console.log('📱 请访问前端页面查看数据: https://your-domain.vercel.app/amazon-overview.html');
    
  } catch (error) {
    console.error('❌ 程序执行失败:', error.message);
    process.exit(1);
  }
}

// 运行主函数
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default AmazonDataPuller;
