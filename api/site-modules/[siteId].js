const {
  getSupabaseClient,
  applyCors,
  parseBoolean,
  parseRole,
  filterModulesByRole,
  fetchModuleMatrix
} = require('./_shared');

function pickModuleFields(moduleInput) {
  const payload = {};
  if (Object.prototype.hasOwnProperty.call(moduleInput, 'enabled')) {
    payload.enabled = moduleInput.enabled === true;
  }
  if (Object.prototype.hasOwnProperty.call(moduleInput, 'navOrder') && Number.isFinite(moduleInput.navOrder)) {
    payload.nav_order = moduleInput.navOrder;
  }
  if (Object.prototype.hasOwnProperty.call(moduleInput, 'navLabel') && moduleInput.navLabel) {
    payload.nav_label = String(moduleInput.navLabel);
  }
  if (Object.prototype.hasOwnProperty.call(moduleInput, 'visibleRoles') && Array.isArray(moduleInput.visibleRoles)) {
    payload.visible_roles = moduleInput.visibleRoles;
  }
  if (Object.prototype.hasOwnProperty.call(moduleInput, 'config') && moduleInput.config && typeof moduleInput.config === 'object') {
    payload.config = moduleInput.config;
  }
  if (Object.prototype.hasOwnProperty.call(moduleInput, 'hasDataSource')) {
    payload.has_data_source = moduleInput.hasDataSource === true;
  }
  return payload;
}

export default async function handler(req, res) {
  applyCors(req, res, ['GET', 'PATCH']);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const siteId = Array.isArray(req.query?.siteId) ? req.query.siteId[0] : req.query?.siteId;
  if (!siteId) {
    return res.status(400).json({
      success: false,
      message: 'Missing siteId parameter'
    });
  }

  const includeGlobal = parseBoolean(req.query?.includeGlobal, true);
  const role = parseRole(req);

  try {
    if (req.method === 'GET') {
      const supabase = getSupabaseClient({ serviceRole: true });
      const matrix = await fetchModuleMatrix(supabase, {
        siteId,
        includeGlobal
      });
      const modules = filterModulesByRole(matrix.modules, role);

      return res.status(200).json({
        success: true,
        data: { modules },
        metadata: {
          siteId,
          siteName: matrix.site?.display_name || null,
          platform: matrix.platform,
          includeGlobal: matrix.includeGlobal,
          role,
          total: modules.length,
          fetchedAt: new Date().toISOString()
        }
      });
    }

    if (req.method === 'PATCH') {
      const modulesPayload = req.body?.modules;
      if (!Array.isArray(modulesPayload) || !modulesPayload.length) {
        return res.status(400).json({
          success: false,
          message: 'modules payload must be a non-empty array'
        });
      }

      const supabase = getSupabaseClient({ serviceRole: true });
      const matrix = await fetchModuleMatrix(supabase, {
        siteId,
        includeGlobal: true
      });

      const siteModuleMap = new Map(matrix.rawSiteModules.map(row => [row.module_key, row]));
      const globalModuleMap = new Map(matrix.rawGlobalModules.map(row => [row.module_key, row]));

      for (const moduleInput of modulesPayload) {
        if (!moduleInput || typeof moduleInput.moduleKey !== 'string') {
          return res.status(400).json({
            success: false,
            message: 'Each module must include a valid moduleKey'
          });
        }
        const moduleKey = moduleInput.moduleKey.trim();
        const updatePayload = pickModuleFields(moduleInput);

        if (!Object.keys(updatePayload).length) {
          continue;
        }

        updatePayload.updated_at = new Date().toISOString();

        const existing = siteModuleMap.get(moduleKey);
        if (existing) {
          const { error } = await supabase
            .from('site_module_configs')
            .update(updatePayload)
            .eq('site_id', siteId)
            .eq('module_key', moduleKey);
          if (error) {
            throw error;
          }
          continue;
        }

        const template = globalModuleMap.get(moduleKey);
        if (!template) {
          return res.status(400).json({
            success: false,
            message: `Module ${moduleKey} is not registered globally and cannot be created automatically`
          });
        }

        const insertPayload = {
          site_id: siteId,
          platform: matrix.platform || template.platform,
          module_key: moduleKey,
          nav_label: updatePayload.nav_label || template.nav_label || moduleKey,
          nav_order: Object.prototype.hasOwnProperty.call(updatePayload, 'nav_order')
            ? updatePayload.nav_order
            : template.nav_order,
          enabled: Object.prototype.hasOwnProperty.call(updatePayload, 'enabled')
            ? updatePayload.enabled
            : template.enabled,
          is_global: false,
          has_data_source: Object.prototype.hasOwnProperty.call(updatePayload, 'has_data_source')
            ? updatePayload.has_data_source
            : template.has_data_source,
          visible_roles: updatePayload.visible_roles || template.visible_roles || [],
          config: updatePayload.config || template.config || {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const { error } = await supabase
          .from('site_module_configs')
          .insert(insertPayload);
        if (error) {
          throw error;
        }
      }

      const refreshed = await fetchModuleMatrix(supabase, {
        siteId,
        includeGlobal
      });
      const modules = filterModulesByRole(refreshed.modules, role);

      return res.status(200).json({
        success: true,
        data: { modules },
        metadata: {
          siteId,
          siteName: refreshed.site?.display_name || null,
          platform: refreshed.platform,
          includeGlobal: refreshed.includeGlobal,
          role,
          total: modules.length,
          updatedAt: new Date().toISOString()
        }
      });
    }

    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    });
  } catch (error) {
    const status = error.statusCode || 500;
    console.error(`Site module handler error for ${siteId}:`, error);
    return res.status(status).json({
      success: false,
      message: error.message || 'Unexpected error while processing site module request'
    });
  }
}
