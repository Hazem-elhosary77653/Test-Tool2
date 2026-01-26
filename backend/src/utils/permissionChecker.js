const pool = require('../db/connection');

// Define base (default) role-based permissions
const ROLE_PERMISSIONS = {
  admin: {
    users: ['create', 'read', 'update', 'delete', 'manage_roles', 'reset_password', 'manage_status'],
    groups: ['create', 'read', 'update', 'delete', 'manage_members'],
    user_stories: ['create', 'read', 'update', 'delete', 'publish'],
    brds: ['create', 'read', 'update', 'delete', 'publish', 'comment', 'generate'],
    templates: ['create', 'read', 'update', 'delete', 'share'],
    documents: ['create', 'read', 'update', 'delete', 'share'],
    diagrams: ['create', 'read', 'update', 'delete'],
    reports: ['create', 'read', 'update', 'delete', 'export'],
    settings: ['read', 'update', 'manage_audit_logs', 'manage_roles'],
    audit_logs: ['read'],
    dashboard: ['read', 'view_analytics'],
    sessions: ['read', 'terminate'],
    activity: ['read', 'read_all', 'export'],
    ai: ['configure', 'read', 'generate'],
    azure_devops: ['configure', 'read', 'sync'],
    permissions: ['read'],
    profile: ['read', 'update'],
    notifications: ['read', 'manage', 'send_bulk', 'configure']
  },
  analyst: {
    users: ['read'],
    groups: ['read', 'manage_members'],
    user_stories: ['create', 'read', 'update', 'delete'],
    brds: ['create', 'read', 'update', 'delete', 'comment', 'generate'],
    templates: ['create', 'read', 'update', 'delete'],
    documents: ['create', 'read', 'update', 'delete'],
    diagrams: ['create', 'read', 'update', 'delete'],
    reports: ['create', 'read', 'export'],
    settings: ['read'],
    audit_logs: [],
    dashboard: ['read'],
    sessions: ['read', 'terminate'],
    activity: ['read'],
    ai: ['configure', 'read', 'generate'],
    azure_devops: ['configure', 'read', 'sync'],
    permissions: ['read'],
    profile: ['read', 'update'],
    notifications: ['read']
  },
  viewer: {
    users: [],
    groups: ['read'],
    user_stories: ['read'],
    brds: ['read', 'comment'],
    templates: ['read'],
    documents: ['read'],
    diagrams: ['read'],
    reports: ['read'],
    settings: ['read'],
    audit_logs: [],
    dashboard: ['read'],
    sessions: ['read', 'terminate'],
    activity: ['read'],
    ai: ['read', 'generate'],
    azure_devops: ['read'],
    permissions: ['read'],
    profile: ['read'],
    notifications: ['read']
  }
};

// In-memory custom permissions loaded from DB (permissions table)
// Shape: { [role]: { [resource]: Set(actions) } }
let CUSTOM_PERMISSIONS = {};

const buildRoleResourceMap = (rows) => {
  const map = {};
  rows.forEach(({ role, resource, action }) => {
    if (!map[role]) map[role] = {};
    if (!map[role][resource]) map[role][resource] = new Set();
    map[role][resource].add(action);
  });
  return map;
};

const refreshCustomPermissions = async () => {
  try {
    const result = await pool.query(`SELECT role, resource, action FROM permissions`);
    CUSTOM_PERMISSIONS = buildRoleResourceMap(result.rows || []);
    console.log('[PERMISSIONS] Custom permissions loaded from DB:', result.rows.length);
    return true;
  } catch (err) {
    console.error('[PERMISSIONS] Failed to load custom permissions:', err.message);
    return false;
  }
};

const getEffectiveActions = (role, resource) => {
  const custom = CUSTOM_PERMISSIONS[role]?.[resource];
  if (custom && custom.size > 0) {
    return Array.from(custom);
  }
  return ROLE_PERMISSIONS[role]?.[resource] || [];
};

// Check if user has permission
const hasPermission = (userRole, resource, action) => {
  const actions = getEffectiveActions(userRole, resource);
  return actions.includes(action);
};

// Get user permissions
const getUserPermissions = (userRole) => {
  const base = ROLE_PERMISSIONS[userRole] || {};
  const custom = CUSTOM_PERMISSIONS[userRole] || {};

  const merged = {};
  const resources = new Set([...Object.keys(base), ...Object.keys(custom)]);

  resources.forEach((res) => {
    const actions = new Set();
    (base[res] || []).forEach((a) => actions.add(a));
    if (custom[res]) {
      custom[res].forEach((a) => actions.add(a));
    }
    merged[res] = Array.from(actions);
  });

  return merged;
};

// Get role permissions
const getRolePermissions = (role) => {
  return getUserPermissions(role);
};

// Check if user can perform action
const checkPermission = (userRole, resource, action) => {
  const allowed = hasPermission(userRole, resource, action);
  return {
    allowed,
    message: allowed ? 'Permission granted' : 'Permission denied'
  };
};

// Get all available permissions
const getAllRoles = () => {
  return Array.from(new Set([
    ...Object.keys(ROLE_PERMISSIONS),
    ...Object.keys(CUSTOM_PERMISSIONS)
  ]));
};

const getAllPermissions = () => {
  const permissions = {};

  getAllRoles().forEach(role => {
    permissions[role] = getUserPermissions(role);
  });

  return permissions;
};

// Check resource access
const canAccessResource = (userRole, resource) => {
  const actions = getEffectiveActions(userRole, resource);
  return actions.length > 0;
};

// Get accessible resources for role
const getAccessibleResources = (userRole) => {
  const resources = [];

  Object.keys(getUserPermissions(userRole) || {}).forEach(resource => {
    const actions = getEffectiveActions(userRole, resource);
    if (actions.length > 0) {
      resources.push(resource);
    }
  });

  return resources;
};

// Flattened list of permissions (role, resource, action)
const flattenRolePermissions = () => {
  const rows = [];

  Object.entries(ROLE_PERMISSIONS).forEach(([role, resources]) => {
    Object.entries(resources).forEach(([resource, actions]) => {
      actions.forEach(action => rows.push({ role, resource, action }));
    });
  });

  return rows;
};

module.exports = {
  hasPermission,
  getUserPermissions,
  getRolePermissions,
  checkPermission,
  getAllPermissions,
  canAccessResource,
  getAccessibleResources,
  flattenRolePermissions,
  refreshCustomPermissions,
  getAllRoles,
  ROLE_PERMISSIONS
};
