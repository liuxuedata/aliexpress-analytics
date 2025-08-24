// Placeholder for downloading Amazon SP-API report document
// TODO: Implement real SP-API call and decompression

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Expected query: ?documentId=...
  // Should download and parse report document and return { rows: [...] }
  return res.status(501).json({ error: 'Not implemented' });
}
