// Placeholder for polling Amazon SP-API report status
// TODO: Implement real SP-API call

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Expected query: ?reportId=...
  // Should call SP-API getReport and return { processingStatus, documentId? }
  return res.status(501).json({ error: 'Not implemented' });
}
