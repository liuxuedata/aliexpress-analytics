const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeModuleRecord,
  mergeModuleConfigs,
  filterModulesByRole,
  normalizeProfile,
  attachFieldProfiles,
} = require('../lib/site-modules');

test('normalizeModuleRecord converts snake_case into camelCase payload', () => {
  const record = {
    id: '123',
    site_id: 'ae_self_operated_a',
    platform: 'ae_self_operated',
    module_key: 'operations',
    nav_label: '运营分析',
    nav_order: '2',
    enabled: true,
    is_global: false,
    has_data_source: true,
    visible_roles: ['Super_Admin', 'viewer'],
    config: { foo: 'bar' },
  };

  const normalized = normalizeModuleRecord(record);

  assert.equal(normalized.id, '123');
  assert.equal(normalized.siteId, 'ae_self_operated_a');
  assert.equal(normalized.platform, 'ae_self_operated');
  assert.equal(normalized.moduleKey, 'operations');
  assert.equal(normalized.navLabel, '运营分析');
  assert.equal(normalized.navOrder, 2);
  assert.equal(normalized.enabled, true);
  assert.equal(normalized.isGlobal, false);
  assert.equal(normalized.hasDataSource, true);
  assert.deepEqual(normalized.visibleRoles, ['super_admin', 'viewer']);
  assert.deepEqual(normalized.config, { foo: 'bar' });
});

test('mergeModuleConfigs respects layer priority and ordering', () => {
  const globalModules = [
    {
      moduleKey: 'operations',
      navOrder: 2,
      navLabel: '运营分析',
      visibleRoles: ['viewer'],
      enabled: true,
    },
    {
      moduleKey: 'products',
      navOrder: 3,
      navLabel: '产品分析',
      visibleRoles: ['viewer'],
      enabled: true,
    },
  ];

  const platformModules = [
    {
      moduleKey: 'operations',
      navOrder: 1,
      navLabel: '运营（平台）',
      visibleRoles: ['viewer'],
    },
  ];

  const siteModules = [
    {
      moduleKey: 'advertising',
      navOrder: 4,
      navLabel: '广告',
      visibleRoles: ['ad_manager'],
    },
    {
      moduleKey: 'operations',
      navOrder: 5,
      navLabel: '运营（站点）',
      visibleRoles: ['operations_manager'],
    },
  ];

  const merged = mergeModuleConfigs({
    globalModules,
    platformModules,
    siteModules,
  });

  assert.equal(merged.length, 3);
  assert.deepEqual(merged.map((m) => m.moduleKey), ['products', 'advertising', 'operations']);
  const operations = merged[2];
  assert.equal(operations.navLabel, '运营（站点）');
  assert.equal(operations.navOrder, 5);
  assert.deepEqual(operations.visibleRoles, ['operations_manager']);
});

test('filterModulesByRole hides modules when role is not permitted', () => {
  const modules = [
    { moduleKey: 'operations', visibleRoles: ['viewer', 'operations_manager'] },
    { moduleKey: 'inventory', visibleRoles: ['super_admin', 'inventory_manager'] },
    { moduleKey: 'permissions', visibleRoles: [] },
  ];

  const viewer = filterModulesByRole(modules, 'viewer');
  assert.deepEqual(viewer.map((m) => m.moduleKey), ['operations', 'permissions']);

  const superAdmin = filterModulesByRole(modules, 'super_admin');
  assert.deepEqual(superAdmin.map((m) => m.moduleKey), ['operations', 'inventory', 'permissions']);
});

test('attachFieldProfiles applies fallback platform sequence', () => {
  const modules = [
    { moduleKey: 'operations', platform: 'all' },
    { moduleKey: 'orders', platform: 'ae_self_operated' },
  ];

  const profiles = [
    normalizeProfile({
      platform: 'ae_self_operated',
      module_key: 'operations',
      available_fields: ['impressions'],
      optional_fields: [],
      missing_fields: ['payments'],
      last_synced_at: '2025-01-09T00:00:00Z',
    }),
    normalizeProfile({
      platform: 'all',
      module_key: 'orders',
      available_fields: ['orders'],
      optional_fields: [],
      missing_fields: ['logistics_cost'],
      last_synced_at: '2025-01-09T00:00:00Z',
    }),
  ];

  const enriched = attachFieldProfiles(modules, profiles, 'ae_self_operated');

  const operations = enriched.find((m) => m.moduleKey === 'operations');
  assert.ok(operations.fieldProfile);
  assert.equal(operations.fieldProfile.platform, 'ae_self_operated');
  assert.deepEqual(operations.fieldProfile.availableFields, ['impressions']);

  const orders = enriched.find((m) => m.moduleKey === 'orders');
  assert.ok(orders.fieldProfile);
  assert.equal(orders.fieldProfile.platform, 'all');
  assert.deepEqual(orders.fieldProfile.missingFields, ['logistics_cost']);
});

