const DEFAULT_ROLE = 'viewer';

function normalizeModuleRecord(record) {
  return {
    id: record.id || null,
    siteId: record.site_id || null,
    platform: record.platform || null,
    moduleKey: record.module_key,
    navLabel: record.nav_label,
    navOrder: typeof record.nav_order === 'number' ? record.nav_order : Number(record.nav_order) || 0,
    enabled: record.enabled !== false,
    isGlobal: record.is_global === true,
    hasDataSource: record.has_data_source === true,
    visibleRoles: Array.isArray(record.visible_roles)
      ? record.visible_roles.map((role) => String(role).toLowerCase())
      : [],
    config: record.config && typeof record.config === 'object' ? record.config : {},
  };
}

function mergeModuleConfigs({
  globalModules = [],
  platformModules = [],
  siteModules = [],
}) {
  const order = [];
  const map = new Map();

  function upsert(list) {
    list.forEach((module) => {
      if (!module || !module.moduleKey) return;
      const existing = map.get(module.moduleKey);
      if (existing) {
        map.set(module.moduleKey, {
          ...existing,
          ...module,
          visibleRoles:
            Array.isArray(module.visibleRoles) && module.visibleRoles.length > 0
              ? module.visibleRoles
              : existing.visibleRoles,
          config:
            module.config && typeof module.config === 'object'
              ? module.config
              : existing.config,
        });
      } else {
        map.set(module.moduleKey, { ...module });
        order.push(module.moduleKey);
      }
    });
  }

  upsert(globalModules);
  upsert(platformModules);
  upsert(siteModules);

  const merged = Array.from(map.values());
  return merged.sort((a, b) => {
    if (a.navOrder === b.navOrder) {
      return a.moduleKey.localeCompare(b.moduleKey);
    }
    return a.navOrder - b.navOrder;
  });
}

function filterModulesByRole(modules, role) {
  const normalizedRole = role ? String(role).toLowerCase() : DEFAULT_ROLE;
  if (normalizedRole === 'super_admin') {
    return modules.slice();
  }

  return modules.filter((module) => {
    if (!Array.isArray(module.visibleRoles) || module.visibleRoles.length === 0) {
      return true;
    }
    return module.visibleRoles.some((allowed) => allowed === normalizedRole);
  });
}

function normalizeProfile(record) {
  return {
    platform: record.platform,
    module: record.module_key,
    availableFields: Array.isArray(record.available_fields) ? record.available_fields : [],
    optionalFields: Array.isArray(record.optional_fields) ? record.optional_fields : [],
    missingFields: Array.isArray(record.missing_fields) ? record.missing_fields : [],
    lastSyncedAt: record.last_synced_at || null,
  };
}

function attachFieldProfiles(modules, profiles, fallbackPlatform) {
  if (!Array.isArray(modules) || modules.length === 0) {
    return [];
  }

  const map = new Map();
  (profiles || []).forEach((profile) => {
    if (!profile || !profile.platform || !profile.module) return;
    map.set(`${profile.platform}|${profile.module}`, profile);
  });

  return modules.map((module) => {
    const candidates = [];

    if (module.platform && module.platform !== 'all') {
      candidates.push(`${module.platform}|${module.moduleKey}`);
    }
    if (fallbackPlatform) {
      candidates.push(`${fallbackPlatform}|${module.moduleKey}`);
    }
    candidates.push(`all|${module.moduleKey}`);

    let selectedProfile;
    for (const key of candidates) {
      if (map.has(key)) {
        selectedProfile = map.get(key);
        break;
      }
    }

    if (!selectedProfile) {
      return { ...module };
    }

    return {
      ...module,
      fieldProfile: {
        platform: selectedProfile.platform,
        module: selectedProfile.module,
        availableFields: selectedProfile.availableFields,
        optionalFields: selectedProfile.optionalFields,
        missingFields: selectedProfile.missingFields,
        lastSyncedAt: selectedProfile.lastSyncedAt,
      },
    };
  });
}

module.exports = {
  normalizeModuleRecord,
  mergeModuleConfigs,
  filterModulesByRole,
  normalizeProfile,
  attachFieldProfiles,
};

