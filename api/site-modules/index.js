const { createClient } = require('@supabase/supabase-js');
const {
  normalizeModuleRecord,
  filterModulesByRole,
  normalizeProfile,
  attachFieldProfiles,
} = require('../../lib/site-modules');

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
}

function getRequesterRole(req) {
  const headerRole = req.headers['x-user-role'] || req.headers['x-role'];
  const queryRole = req.query?.role;
  const role = headerRole || queryRole;
  return role ? String(role).trim().toLowerCase() : undefined;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Role, X-Role');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getClient();
    const requesterRole = getRequesterRole(req);

    const { data: records, error } = await supabase
      .from('site_module_configs')
      .select('*')
      .is('site_id', null)
      .order('nav_order', { ascending: true })
      .order('module_key', { ascending: true });

    if (error) throw error;

    const normalizedModules = (records || []).map(normalizeModuleRecord);

    const { data: profileRows, error: profileError } = await supabase
      .from('platform_metric_profiles')
      .select('*');

    if (profileError) throw profileError;

    const profiles = (profileRows || []).map(normalizeProfile);
    const withProfiles = attachFieldProfiles(normalizedModules, profiles, 'all');
    const filtered = filterModulesByRole(withProfiles, requesterRole);

    return res.status(200).json({
      ok: true,
      data: { modules: filtered },
    });
  } catch (error) {
    console.error('[site-modules] error:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}

