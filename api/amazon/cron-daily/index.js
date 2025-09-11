// Amazon 每日定时任务 - 串行调度完整流程
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
  
  // 支持测试模式
  let dateStr;
  let isTestMode = false;
  
  if (req.method === 'POST' && req.body?.testMode) {
    // 测试模式：拉取指定日期之前的数据
    isTestMode = true;
    const targetDate = req.body.targetDate || '2025-09-09';
    dateStr = targetDate;
    console.log(`[Amazon Cron] Test mode: pulling data before ${dateStr}`);
  } else {
    // 正常模式：计算昨天的日期（UTC）
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
    dateStr = yesterday.toISOString().slice(0, 10);
  }
  
  console.log(`[Amazon Cron] Starting daily sync for date: ${dateStr}`);

  try {
    // 测试模式：拉取多天数据
    if (isTestMode) {
      return await pullMultipleDaysData(baseUrl, dateStr, res);
    }
    
    // 正常模式：拉取单天数据
    return await pullSingleDayData(baseUrl, dateStr, res);
    
  } catch (error) {
    console.error(`[Amazon Cron] Error: ${error.message}`);
    return res.status(500).json({ 
      ok: false, 
      error: error.message,
      date: dateStr,
      mode: isTestMode ? 'test' : 'normal'
    });
  }
}

// 拉取单天数据（正常模式）
async function pullSingleDayData(baseUrl, dateStr, res) {
  // 步骤1: 创建报表请求
  console.log(`[Amazon Cron] Step 1: Creating report for ${dateStr}`);
  const createResponse = await fetch(`${baseUrl}/api/amazon/report-create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      dataStartTime: `${dateStr}T00:00:00Z`, 
      dataEndTime: `${dateStr}T23:59:59Z` 
    })
  });

    if (!createResponse.ok) {
      throw new Error(`Report creation failed: ${createResponse.status}`);
    }

    const createResult = await createResponse.json();
    console.log(`[Amazon Cron] Report created: ${createResult.reportId}`);

    if (!createResult.reportId) {
      throw new Error('No reportId returned from create request');
    }

    // 步骤2: 轮询报表状态直到完成
    console.log(`[Amazon Cron] Step 2: Polling report status`);
    let pollResult;
    let attempts = 0;
    const maxAttempts = 30; // 最多轮询30次，每次等待2分钟
    const pollInterval = 2 * 60 * 1000; // 2分钟

    while (attempts < maxAttempts) {
      attempts++;
      console.log(`[Amazon Cron] Polling attempt ${attempts}/${maxAttempts}`);

      const pollResponse = await fetch(`${baseUrl}/api/amazon/report-poll?reportId=${encodeURIComponent(createResult.reportId)}`);
      
      if (!pollResponse.ok) {
        throw new Error(`Report polling failed: ${pollResponse.status}`);
      }

      pollResult = await pollResponse.json();
      console.log(`[Amazon Cron] Polling result: ${pollResult.processingStatus}`);

      if (pollResult.processingStatus === 'DONE') {
        break;
      } else if (pollResult.processingStatus === 'FATAL' || pollResult.processingStatus === 'CANCELLED') {
        throw new Error(`Report processing failed with status: ${pollResult.processingStatus}`);
      }

      // 等待后继续轮询
      if (attempts < maxAttempts) {
        console.log(`[Amazon Cron] Waiting ${pollInterval/1000}s before next poll...`);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    if (attempts >= maxAttempts) {
      throw new Error('Report polling timeout - maximum attempts reached');
    }

    if (!pollResult.documentId) {
      throw new Error('No documentId returned from polling');
    }

    // 步骤3: 下载报表数据
    console.log(`[Amazon Cron] Step 3: Downloading report data`);
    const downloadResponse = await fetch(`${baseUrl}/api/amazon/report-download?documentId=${encodeURIComponent(pollResult.documentId)}`);
    
    if (!downloadResponse.ok) {
      throw new Error(`Report download failed: ${downloadResponse.status}`);
    }

    const downloadResult = await downloadResponse.json();
    console.log(`[Amazon Cron] Downloaded ${downloadResult.totalRows} rows`);

    if (!Array.isArray(downloadResult.rows) || downloadResult.rows.length === 0) {
      console.log(`[Amazon Cron] No data rows to upsert`);
      return res.status(200).json({ 
        ok: true, 
        message: 'No data to process',
        date: dateStr,
        create: createResult,
        poll: pollResult,
        download: downloadResult
      });
    }

    // 步骤4: 数据入库
    console.log(`[Amazon Cron] Step 4: Upserting ${downloadResult.rows.length} rows to database`);
    const upsertResponse = await fetch(`${baseUrl}/api/amazon/upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: downloadResult.rows })
    });

    if (!upsertResponse.ok) {
      throw new Error(`Data upsert failed: ${upsertResponse.status}`);
    }

    const upsertResult = await upsertResponse.json();
    console.log(`[Amazon Cron] Successfully upserted ${upsertResult.upserted} rows`);

    return res.status(200).json({ 
      ok: true, 
      message: 'Daily sync completed successfully',
      date: dateStr,
      summary: {
        reportId: createResult.reportId,
        totalRows: downloadResult.totalRows,
        upsertedRows: upsertResult.upserted,
        pollingAttempts: attempts
      },
      create: createResult,
      poll: pollResult,
      download: downloadResult,
      upsert: upsertResult
    });

  } catch (error) {
    console.error(`[Amazon Cron] Error:`, error);
    return res.status(500).json({ 
      error: 'Daily sync failed',
      message: error.message,
      date: dateStr
    });
  }
}

// 拉取多天数据（测试模式）
async function pullMultipleDaysData(baseUrl, targetDate, res) {
  console.log(`[Amazon Cron] Test mode: pulling data for multiple days before ${targetDate}`);
  
  const results = [];
  const errors = [];
  
  // 拉取最近7天的数据
  const daysToPull = 7;
  const targetDateObj = new Date(targetDate + 'T00:00:00Z');
  
  for (let i = 1; i <= daysToPull; i++) {
    const currentDate = new Date(targetDateObj.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = currentDate.toISOString().slice(0, 10);
    
    try {
      console.log(`[Amazon Cron] Pulling data for ${dateStr} (${i}/${daysToPull})`);
      
      // 调用单天数据拉取
      const result = await pullSingleDayData(baseUrl, dateStr, { 
        status: () => ({ json: (data) => data }) 
      });
      
      if (result.ok) {
        results.push({ date: dateStr, success: true, rows: result.summary?.upsertedRows || 0 });
        console.log(`[Amazon Cron] Successfully pulled data for ${dateStr}: ${result.summary?.upsertedRows || 0} rows`);
      } else {
        errors.push({ date: dateStr, error: result.error || 'Unknown error' });
        console.log(`[Amazon Cron] Failed to pull data for ${dateStr}: ${result.error}`);
      }
      
      // 添加延迟避免API限制
      if (i < daysToPull) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2秒延迟
      }
      
    } catch (error) {
      errors.push({ date: dateStr, error: error.message });
      console.error(`[Amazon Cron] Error pulling data for ${dateStr}:`, error.message);
    }
  }
  
  const totalRows = results.reduce((sum, r) => sum + r.rows, 0);
  
  return res.status(200).json({
    ok: true,
    message: 'Test data pull completed',
    mode: 'test',
    targetDate: targetDate,
    summary: {
      totalDays: daysToPull,
      successfulDays: results.length,
      failedDays: errors.length,
      totalRows: totalRows
    },
    results: results,
    errors: errors
  });
}
