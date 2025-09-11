// 测试Amazon SP-API实际返回的数据结构
export default async function handler(req, res) {
  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
  
  try {
    console.log('[Test SP-API] Starting test...');
    
    // 步骤1: 创建报表请求
    console.log('[Test SP-API] Step 1: Creating report');
    const createResponse = await fetch(`${baseUrl}/api/amazon/report-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        dataStartTime: '2025-09-08T00:00:00Z', 
        dataEndTime: '2025-09-08T23:59:59Z' 
      })
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      return res.status(500).json({ 
        error: 'Report creation failed', 
        status: createResponse.status,
        details: errorText
      });
    }

    const createResult = await createResponse.json();
    console.log('[Test SP-API] Report created:', createResult.reportId);

    if (!createResult.reportId) {
      return res.status(500).json({ 
        error: 'No reportId returned',
        createResult 
      });
    }

    // 步骤2: 轮询报表状态
    console.log('[Test SP-API] Step 2: Polling report status');
    let pollResult;
    let attempts = 0;
    const maxAttempts = 10; // 减少轮询次数用于测试
    const pollInterval = 30 * 1000; // 30秒

    while (attempts < maxAttempts) {
      attempts++;
      console.log(`[Test SP-API] Polling attempt ${attempts}/${maxAttempts}`);

      const pollResponse = await fetch(`${baseUrl}/api/amazon/report-poll?reportId=${encodeURIComponent(createResult.reportId)}`);
      
      if (!pollResponse.ok) {
        const errorText = await pollResponse.text();
        return res.status(500).json({ 
          error: 'Report polling failed', 
          status: pollResponse.status,
          details: errorText
        });
      }

      pollResult = await pollResponse.json();
      console.log('[Test SP-API] Polling result:', pollResult.processingStatus);

      if (pollResult.processingStatus === 'DONE') {
        break;
      } else if (pollResult.processingStatus === 'FATAL' || pollResult.processingStatus === 'CANCELLED') {
        return res.status(500).json({ 
          error: 'Report processing failed', 
          status: pollResult.processingStatus,
          pollResult 
        });
      }

      // 等待后继续轮询
      if (attempts < maxAttempts) {
        console.log(`[Test SP-API] Waiting ${pollInterval/1000}s before next poll...`);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    if (attempts >= maxAttempts) {
      return res.status(500).json({ 
        error: 'Report polling timeout',
        attempts,
        pollResult 
      });
    }

    if (!pollResult.documentId) {
      return res.status(500).json({ 
        error: 'No documentId returned',
        pollResult 
      });
    }

    // 步骤3: 下载报表数据
    console.log('[Test SP-API] Step 3: Downloading report data');
    const downloadResponse = await fetch(`${baseUrl}/api/amazon/report-download?documentId=${encodeURIComponent(pollResult.documentId)}`);
    
    if (!downloadResponse.ok) {
      const errorText = await downloadResponse.text();
      return res.status(500).json({ 
        error: 'Report download failed', 
        status: downloadResponse.status,
        details: errorText
      });
    }

    const downloadResult = await downloadResponse.json();
    console.log('[Test SP-API] Downloaded data:', downloadResult);

    return res.status(200).json({
      ok: true,
      message: 'SP-API test completed',
      summary: {
        reportId: createResult.reportId,
        documentId: pollResult.documentId,
        totalRows: downloadResult.totalRows,
        pollingAttempts: attempts
      },
      create: createResult,
      poll: pollResult,
      download: downloadResult,
      // 显示前几行原始数据用于调试
      sampleRawData: downloadResult.rows?.slice(0, 3) || []
    });

  } catch (error) {
    console.error('[Test SP-API] Error:', error);
    return res.status(500).json({ 
      error: 'SP-API test failed',
      message: error.message,
      stack: error.stack
    });
  }
}
