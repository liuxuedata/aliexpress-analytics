const { createClient } = require('@supabase/supabase-js');
const {
  normalizeModuleRecord,
  mergeModuleConfigs,
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

function shouldIncludeGlobal(req) {
  const flag = req.query?.includeGlobal;
  if (flag === undefined) return true;
  if (Array.isArray(flag)) {
    return flag[flag.length - 1] !== 'false';
  }
  return flag !== 'false' && flag !== '0';
}

async function loadModuleLayers(supabase, siteId, platform, includeGlobal) {
  const { data: siteRecords, error: siteError } = await supabase
    .from('site_module_configs')
    .select('*')
    .eq('site_id', siteId)
    .order('nav_order', { ascending: true })
    .order('module_key', { ascending: true });

  if (siteError) throw siteError;

  const siteModules = (siteRecords || []).map(normalizeModuleRecord);

  if (!includeGlobal) {
    return { siteModules, platformModules: [], globalModules: [] };
  }

  const { data: fallbackRecords, error: fallbackError } = await supabase
    .from('site_module_configs')
    .select('*')
    .is('site_id', null)
    .in('platform', ['all', platform])
    .order('nav_order', { ascending: true })
    .order('module_key', { ascending: true });

  if (fallbackError) throw fallbackError;

  const normalizedFallback = (fallbackRecords || []).map(normalizeModuleRecord);
  const platformModules = normalizedFallback.filter((module) => module.platform === platform);
  const globalModules = normalizedFallback.filter((module) => module.platform === 'all');

  return { siteModules, platformModules, globalModules };
}

async function loadProfiles(supabase, platforms) {
  const uniquePlatforms = Array.from(new Set(platforms.filter(Boolean)));
  if (uniquePlatforms.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('platform_metric_profiles')
    .select('*')
    .in('platform', uniquePlatforms);

  if (error) throw error;
  return (data || []).map(normalizeProfile);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Role, X-Role');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { siteId } = req.query;
  if (!siteId) {
    return res.status(400).json({ ok: false, error: 'Site ID is required' });
  }

  const supabase = getClient();
  const requesterRole = getRequesterRole(req);

  try {
    const { data: siteConfig, error: siteConfigError } = await supabase
      .from('site_configs')
      .select('id, platform')
      .eq('id', siteId)
      .single();

    if (siteConfigError) {
      if (siteConfigError.code === 'PGRST116') {
        return res.status(404).json({ ok: false, error: 'Site not found' });
      }
      throw siteConfigError;
    }

    const includeGlobal = shouldIncludeGlobal(req);

    switch (req.method) {
      case 'GET': {
        const layers = await loadModuleLayers(supabase, siteId, siteConfig.platform, includeGlobal);
        const merged = mergeModuleConfigs(layers);

        const profilePlatforms = new Set(['all', siteConfig.platform]);
        merged.forEach((module) => {
          if (module.platform && module.platform !== 'all') {
            profilePlatforms.add(module.platform);
          }
        });

        const profiles = await loadProfiles(supabase, Array.from(profilePlatforms));
        const withProfiles = attachFieldProfiles(merged, profiles, siteConfig.platform);
        const filtered = filterModulesByRole(withProfiles, requesterRole);

        return res.status(200).json({
          ok: true,
          data: { modules: filtered },
        });
      }
      case 'PATCH': {
        if (requesterRole !== 'super_admin') {
          return res.status(403).json({ ok: false, error: 'Insufficient permissions' });
        }

        const body = req.body || {};
        if (!body.modules || !Array.isArray(body.modules)) {
          return res.status(400).json({ ok: false, error: 'modules array is required' });
        }

        const layers = await loadModuleLayers(supabase, siteId, siteConfig.platform, true);

        const siteMap = new Map(layers.siteModules.map((module) => [module.moduleKey, module]));
        const platformMap = new Map(layers.platformModules.map((module) => [module.moduleKey, module]));
        const globalMap = new Map(layers.globalModules.map((module) => [module.moduleKey, module]));

        const preparedRecords = [];

        for (const moduleInput of body.modules) {
          if (!moduleInput || !moduleInput.moduleKey) {
            return res.status(400).json({ ok: false, error: 'moduleKey is required for each module' });
          }

          const key = String(moduleInput.moduleKey);
          const existing = siteMap.get(key);
          const fallback = platformMap.get(key) || globalMap.get(key);

          const visibleRoles = Array.isArray(moduleInput.visibleRoles)
            ? moduleInput.visibleRoles.map((role) => String(role).toLowerCase())
            : existing?.visibleRoles || fallback?.visibleRoles || [];

          const prepared = {
            id: existing?.id || null,
            site_id: siteId,
            platform: siteConfig.platform,
            module_key: key,
            nav_label: moduleInput.navLabel ?? existing?.navLabel ?? fallback?.navLabel ?? key,
            nav_order:
              typeof moduleInput.navOrder === 'number'
                ? moduleInput.navOrder
                : existing?.navOrder ?? fallback?.navOrder ?? 0,
            enabled:
              typeof moduleInput.enabled === 'boolean'
                ? moduleInput.enabled
                : existing?.enabled ?? fallback?.enabled ?? true,
            has_data_source:
              typeof moduleInput.hasDataSource === 'boolean'
                ? moduleInput.hasDataSource
                : existing?.hasDataSource ?? fallback?.hasDataSource ?? false,
            is_global: existing?.isGlobal ?? false,
            visible_roles: visibleRoles,
            config:
              moduleInput.config && typeof moduleInput.config === 'object'
                ? moduleInput.config
                : existing?.config || fallback?.config || {},
          };

          preparedRecords.push(prepared);
        }

        const mutations = preparedRecords.map(async (record) => {
          if (record.id) {
            const updatePayload = { ...record };
            delete updatePayload.id;
            const { data, error } = await supabase
              .from('site_module_configs')
              .update(updatePayload)
              .eq('id', record.id)
              .select()
              .single();

            if (error) throw error;
            return data;
          }

          const insertPayload = { ...record };
          delete insertPayload.id;
          const { data, error } = await supabase
            .from('site_module_configs')
            .insert(insertPayload)
            .select()
            .single();

          if (error) throw error;
          return data;
        });

        await Promise.all(mutations);

        const updatedLayers = await loadModuleLayers(supabase, siteId, siteConfig.platform, includeGlobal);
        const merged = mergeModuleConfigs(updatedLayers);

        const profilePlatforms = new Set(['all', siteConfig.platform]);
        merged.forEach((module) => {
          if (module.platform && module.platform !== 'all') {
            profilePlatforms.add(module.platform);
          }
        });

        const profiles = await loadProfiles(supabase, Array.from(profilePlatforms));
        const withProfiles = attachFieldProfiles(merged, profiles, siteConfig.platform);
        const filtered = filterModulesByRole(withProfiles, requesterRole);

        return res.status(200).json({
          ok: true,
          data: { modules: filtered },
        });
      }
      default:
        return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
  } catch (error) {
    console.error(`[site-modules:${siteId}] error:`, error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}

