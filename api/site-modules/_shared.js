const { createClient } = require('@supabase/supabase-js');

function getSupabaseClient({ serviceRole = false } = {}) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const key = serviceRole ? (serviceKey || anonKey) : (anonKey || serviceKey);
  if (!url || !key) {
    throw new Error('Supabase environment variables are not configured');
  }
  return createClient(url, key, {
    auth: { persistSession: false }
  });
}

function applyCors(req, res, methods = ['GET', 'OPTIONS']) {
  const allowMethods = Array.from(new Set([...methods, 'OPTIONS']));
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', allowMethods.join(', '));
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Role');
}

function parseBoolean(value, defaultValue = true) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value).toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false;
  }
  return defaultValue;
}

function parseRole(req) {
  const headerRole = req.headers['x-user-role'] || req.headers['x-role'];
  const queryRole = req.query?.role;
  const rawRole = (headerRole || queryRole || '').toString().trim();
  if (!rawRole) return 'viewer';
  return rawRole.toLowerCase();
}

function normalizeRoles(roleArray) {
  if (!Array.isArray(roleArray)) return [];
  return roleArray
    .map(role => (role || '').toString().trim())
    .filter(Boolean)
    .map(role => role.toLowerCase());
}

function filterModulesByRole(modules, role) {
  if (!role || role === 'super_admin') {
    return modules;
  }
  return modules.filter(module => {
    const roles = normalizeRoles(module.visibleRoles);
    if (!roles.length) return true;
    return roles.includes(role) || roles.includes('viewer');
  });
}

async function fetchSiteRecord(supabase, siteId) {
  if (!siteId) return { site: null, platform: null };
  const { data, error } = await supabase
    .from('site_configs')
    .select('id, platform, display_name')
    .eq('id', siteId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    const err = new Error(`Site ${siteId} not found`);
    err.statusCode = 404;
    throw err;
  }
  return { site: data, platform: data.platform };
}

async function fetchPlatformProfiles(supabase, moduleKeys, platforms) {
  if (!moduleKeys.length || !platforms.length) {
    return new Map();
  }
  const uniquePlatforms = Array.from(new Set(platforms.filter(Boolean)));
  if (!uniquePlatforms.length) {
    return new Map();
  }
  const { data, error } = await supabase
    .from('platform_metric_profiles')
    .select('platform, module_key, available_fields, optional_fields, missing_fields, notes, last_synced_at')
    .in('platform', uniquePlatforms)
    .in('module_key', Array.from(new Set(moduleKeys)));
  if (error) {
    console.warn('Failed to fetch platform metric profiles:', error);
    return new Map();
  }
  const profileMap = new Map();
  for (const row of data || []) {
    profileMap.set(`${row.platform}:${row.module_key}`, row);
  }
  return profileMap;
}

function mapModule(row, { profileMap, siteId }) {
  const moduleKey = row.module_key;
  const platform = row.platform;
  const profile = profileMap.get(`${platform}:${moduleKey}`) || profileMap.get(`all:${moduleKey}`);
  const mapped = {
    moduleKey,
    navLabel: row.nav_label,
    navOrder: typeof row.nav_order === 'number' ? row.nav_order : 0,
    enabled: row.enabled !== false,
    isGlobal: row.is_global === true,
    platform,
    siteId: row.site_id || siteId || null,
    visibleRoles: Array.isArray(row.visible_roles) ? row.visible_roles : [],
    hasDataSource: row.has_data_source === true,
    config: row.config || {},
    source: row.site_id ? 'site' : 'global'
  };
  if (profile) {
    mapped.fieldProfile = {
      platform: profile.platform,
      module: profile.module_key,
      availableFields: profile.available_fields || [],
      optionalFields: profile.optional_fields || [],
      missingFields: profile.missing_fields || [],
      lastSyncedAt: profile.last_synced_at || null,
      notes: profile.notes || null
    };
  }
  return mapped;
}

async function fetchModuleMatrix(supabase, { siteId = null, includeGlobal = true, platformHint = null } = {}) {
  const result = {
    site: null,
    platform: platformHint || null,
    modules: [],
    rawSiteModules: [],
    rawGlobalModules: [],
    includeGlobal: includeGlobal !== false
  };

  if (siteId) {
    const { site, platform } = await fetchSiteRecord(supabase, siteId);
    result.site = site;
    result.platform = platform;
  }

  if (siteId) {
    const { data, error } = await supabase
      .from('site_module_configs')
      .select('*')
      .eq('site_id', siteId)
      .order('nav_order', { ascending: true })
      .order('module_key', { ascending: true });
    if (error) throw error;
    result.rawSiteModules = data || [];
  }

  if (result.includeGlobal) {
    let query = supabase
      .from('site_module_configs')
      .select('*')
      .is('site_id', null)
      .order('nav_order', { ascending: true })
      .order('module_key', { ascending: true });
    const platformFilter = result.platform || platformHint;
    if (platformFilter) {
      query = query.in('platform', Array.from(new Set(['all', platformFilter])));
    }
    const { data, error } = await query;
    if (error) throw error;
    result.rawGlobalModules = data || [];
  }

  const moduleMap = new Map();
  for (const row of result.rawGlobalModules) {
    moduleMap.set(row.module_key, { row, source: 'global' });
  }
  for (const row of result.rawSiteModules) {
    moduleMap.set(row.module_key, { row, source: 'site' });
  }

  const mergedRows = Array.from(moduleMap.values())
    .map(entry => entry.row)
    .sort((a, b) => {
      const orderA = typeof a.nav_order === 'number' ? a.nav_order : 0;
      const orderB = typeof b.nav_order === 'number' ? b.nav_order : 0;
      if (orderA !== orderB) return orderA - orderB;
      return a.module_key.localeCompare(b.module_key);
    });

  const moduleKeys = mergedRows.map(row => row.module_key);
  const profilePlatforms = [result.platform || platformHint, 'all'].filter(Boolean);
  const profileMap = await fetchPlatformProfiles(supabase, moduleKeys, profilePlatforms);

  result.modules = mergedRows.map(row => mapModule(row, { profileMap, siteId }));
  return result;
}

module.exports = {
  getSupabaseClient,
  applyCors,
  parseBoolean,
  parseRole,
  filterModulesByRole,
  fetchModuleMatrix,
  normalizeRoles
};
