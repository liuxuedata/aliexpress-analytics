import fetch from 'node-fetch';

// Placeholder daily cron task orchestrating report workflow
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
  const y = new Date(Date.now() - 24 * 3600 * 1000);
  const dateStr = y.toISOString().slice(0, 10);

  try {
    const create = await fetch(`${baseUrl}/api/amazon/report-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataStartTime: `${dateStr}T00:00:00Z`, dataEndTime: `${dateStr}T23:59:59Z` })
    }).then(r => r.json());

    const poll = create.reportId
      ? await fetch(`${baseUrl}/api/amazon/report-poll?reportId=${encodeURIComponent(create.reportId)}`).then(r => r.json())
      : create;

    const download = poll.documentId
      ? await fetch(`${baseUrl}/api/amazon/report-download?documentId=${encodeURIComponent(poll.documentId)}`).then(r => r.json())
      : poll;

    const upsert = Array.isArray(download.rows)
      ? await fetch(`${baseUrl}/api/amazon/upsert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: download.rows })
        }).then(r => r.json())
      : download;

    return res.status(200).json({ ok: true, create, poll, download, upsert });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
