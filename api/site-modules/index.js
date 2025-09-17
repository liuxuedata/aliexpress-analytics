const {
  getSupabaseClient,
  applyCors,
  parseBoolean,
  fetchModuleMatrix,
  filterModulesByRole,
  parseRole
} = require('./_shared');

export default async function handler(req, res) {
  applyCors(req, res, ['GET']);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    });
  }

  try {
    const includeGlobal = parseBoolean(req.query?.includeGlobal, true);
    const platform = req.query?.platform ? String(req.query.platform).toLowerCase() : null;
    const role = parseRole(req);

    const supabase = getSupabaseClient();
    const matrix = await fetchModuleMatrix(supabase, {
      includeGlobal,
      platformHint: platform
    });

    const modules = filterModulesByRole(matrix.modules, role);

    return res.status(200).json({
      success: true,
      data: { modules },
      metadata: {
        includeGlobal: matrix.includeGlobal,
        platform: matrix.platform || platform || 'all',
        role,
        total: modules.length,
        fetchedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Failed to load site modules:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Unexpected error while loading site modules'
    });
  }
}
