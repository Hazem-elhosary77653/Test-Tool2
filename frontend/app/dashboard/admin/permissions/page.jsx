'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store';
import api from '@/lib/api';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Breadcrumb from '@/components/Breadcrumb';
import Toast from '@/components/Toast';
import useToast from '@/hooks/useToast';
import { Shield, Eye, Edit2, Trash2, Plus } from 'lucide-react';

export default function PermissionsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { toast, success, error: showError, close: closeToast } = useToast();
  const [rolePermissions, setRolePermissions] = useState({});
  const [customPermissions, setCustomPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formLoading, setFormLoading] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [formData, setFormData] = useState({
    role: '',
    resource: ''
  });
  const [selectedActions, setSelectedActions] = useState([]);
  const [customAction, setCustomAction] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [expandedRoles, setExpandedRoles] = useState(new Set());

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    fetchPermissions();
  }, [user, router]);

  const fetchPermissions = async () => {
    try {
      setLoading(true);
      const [allRolesRes, customRes] = await Promise.all([
        api.get('/permissions/all'),
        api.get('/permissions')
      ]);

      setRolePermissions(allRolesRes.data?.data || {});
      const defaultRoles = ['admin', 'analyst', 'viewer'];
      const dbRows = customRes.data?.data || [];
      const nonDefaultRows = dbRows.filter((row) => !defaultRoles.includes(row.role));
      setCustomPermissions(nonDefaultRows);
      if (!formData.role && allRolesRes.data?.data) {
        const availableRoles = Object.keys(allRolesRes.data.data);
        setFormData((prev) => ({ ...prev, role: availableRoles[0] || '__new__' }));
      }
      const initialExpanded = new Set(Object.keys(allRolesRes.data?.data || {}));
      setExpandedRoles(initialExpanded);
      success('Permissions loaded');
    } catch (err) {
      console.error('Error fetching permissions:', err);
      showError(err.response?.data?.error || 'Failed to fetch permissions');
    } finally {
      setLoading(false);
    }
  };

  const roleOptions = useMemo(() => {
    const roles = new Set();
    Object.keys(rolePermissions || {}).forEach((role) => roles.add(role));
    customPermissions.forEach(({ role }) => roles.add(role));
    return Array.from(roles).sort();
  }, [rolePermissions, customPermissions]);

  const resourceOptions = useMemo(() => {
    const resources = new Set();
    Object.values(rolePermissions || {}).forEach((resourceMap) => {
      Object.keys(resourceMap || {}).forEach((res) => resources.add(res));
    });
    customPermissions.forEach(({ resource }) => resources.add(resource));
    return Array.from(resources).sort();
  }, [rolePermissions, customPermissions]);

  const handleAddPermission = async (e) => {
    e.preventDefault();
    const actions = [...selectedActions];
    if (customAction.trim()) actions.push(customAction.trim());
    const roleValue = formData.role === '__new__' ? newRoleName.trim() : formData.role;
    if (!roleValue || !formData.resource || actions.length === 0) {
      showError('Role, resource, and at least one action are required');
      return;
    }

    try {
      setFormLoading(true);
      const payload = {
        role: roleValue.trim(),
        resource: formData.resource.trim()
      };

      if (editTarget) {
        await api.delete('/permissions', { data: editTarget });
      }

      await Promise.all(
        actions.map((action) =>
          api.post('/permissions', { ...payload, action })
        )
      );
      success(editTarget ? 'Permission updated' : 'Permission added');
      setSelectedActions([]);
      setCustomAction('');
      setNewRoleName('');
      setEditTarget(null);
      fetchPermissions();
    } catch (err) {
      console.error('Error adding permission:', err);
      showError(err.response?.data?.error || 'Failed to add permission');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeletePermission = async (roleOrPerm, resource, action) => {
    let role, res, act;

    if (typeof roleOrPerm === 'object') {
      role = roleOrPerm.role;
      res = roleOrPerm.resource;
      act = roleOrPerm.action;
    } else {
      role = roleOrPerm;
      res = resource;
      act = action;
    }

    if (!confirm(`Remove ${act} on ${res} for ${role}?`)) return;
    try {
      setDeleting(`${role}-${res}-${act}`);
      await api.delete('/permissions', {
        data: {
          role,
          resource: res,
          action: act
        }
      });
      success('Permission removed');
      if (editTarget && editTarget.role === role && editTarget.resource === res && editTarget.action === act) {
        setEditTarget(null);
      }
      fetchPermissions();
    } catch (err) {
      console.error('Error removing permission:', err);
      showError(err.response?.data?.error || 'Failed to remove permission');
    } finally {
      setDeleting(null);
    }
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'admin':
        return 'bg-red-50 border-red-200';
      case 'analyst':
        return 'bg-blue-50 border-blue-200';
      case 'viewer':
        return 'bg-gray-50 border-gray-200';
      default:
        return 'bg-white border-gray-200';
    }
  };

  const getPermissionCategory = (resource) => {
    if (resource.includes('user')) return 'User Management';
    if (resource.includes('story')) return 'User Stories';
    if (resource.includes('brd')) return 'BRDs';
    if (resource.includes('document')) return 'Documents';
    if (resource.includes('template')) return 'Templates';
    if (resource.includes('analytics') || resource.includes('audit') || resource.includes('settings') || resource.includes('report')) return 'Admin';
    if (resource.includes('notification')) return 'Notifications';
    return 'General';
  };

  const groupPermissions = (resourceMap) => {
    const grouped = {};
    Object.entries(resourceMap || {}).forEach(([resource, actions]) => {
      const category = getPermissionCategory(resource);
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push({ resource, actions });
    });
    return grouped;
  };

  const formatPermissionText = (text) => {
    return text
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const startEdit = (perm) => {
    setEditTarget({ role: perm.role, resource: perm.resource, action: perm.action });
    setFormData({ role: perm.role, resource: perm.resource });
    setSelectedActions([perm.action]);
    setCustomAction('');
    setNewRoleName('');
  };

  const cancelEdit = () => {
    setEditTarget(null);
    setFormData({ role: roleOptions[0] || '__new__', resource: '' });
    setSelectedActions([]);
    setCustomAction('');
    setNewRoleName('');
  };

  const toggleAction = (action) => {
    setSelectedActions((prev) => {
      const exists = prev.includes(action);
      if (exists) return prev.filter((a) => a !== action);
      return [...prev, action];
    });
  };

  const toggleRoleSection = (role) => {
    setExpandedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) {
        next.delete(role);
      } else {
        next.add(role);
      }
      return next;
    });
  };

  return (
    <div className="flex h-screen bg-gray-50 text-[13px] md:text-[14px]">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-4 py-5 md:px-6 md:py-6">
            {/* Breadcrumb */}
            <Breadcrumb
              items={[
                { label: 'Admin', href: '/dashboard/admin' },
                { label: 'Roles & Permissions' }
              ]}
            />

            {/* Toast */}
            {toast && (
              <Toast
                message={toast.message}
                type={toast.type}
                duration={toast.duration}
                onClose={closeToast}
              />
            )}

            {/* Page Header */}
            <div className="mb-7 mt-6">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1.5">
                    Roles & Permissions
                  </h1>
                  <p className="text-gray-600">Manage user roles and their associated permissions</p>
                </div>
                <button
                  onClick={fetchPermissions}
                  disabled={loading}
                  className="px-3.5 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition"
                >
                  Refresh
                </button>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-24">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                <p className="text-gray-600 mt-4">Loading permissions...</p>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Default Roles Section */}
                <div>
                  <div className="mb-3.5">
                    <h2 className="text-lg md:text-xl font-bold text-gray-900 flex items-center gap-2">
                      <Shield size={24} className="text-primary" />
                      Default Roles
                    </h2>
                    <p className="text-sm text-gray-600 mt-0.5">Built-in roles with predefined permissions</p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {Object.entries(rolePermissions || {})
                      .filter(([role]) => ['admin', 'analyst', 'viewer'].includes(role))
                      .map(([role, resourceMap]) => {
                        const grouped = groupPermissions(resourceMap);
                        const totalPerms = Object.values(resourceMap || {}).reduce((acc, actions) => acc + (actions?.length || 0), 0);
                        const isOpen = expandedRoles.has(role);
                        return (
                          <div key={role} className={`bg-white border-2 rounded-lg overflow-hidden ${getRoleColor(role)}`}>
                            <button
                              className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50 transition"
                              onClick={() => toggleRoleSection(role)}
                            >
                              <div>
                                <h3 className="text-lg font-bold text-gray-900">
                                  {role.charAt(0).toUpperCase() + role.slice(1)}
                                </h3>
                                <p className="text-xs text-gray-600 mt-1">
                                  {totalPerms} actions
                                </p>
                              </div>
                              <div className={`text-2xl transition ${isOpen ? 'rotate-180' : ''}`}>
                                ▼
                              </div>
                            </button>

                            {isOpen && (
                              <div className="border-t p-4 bg-gray-50">
                                <div className="space-y-3">
                                  {Object.entries(grouped).map(([category, entries]) => (
                                    <div key={category}>
                                      <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                                        {category}
                                      </p>
                                      <div className="space-y-2 ml-2 border-l-2 border-gray-300 pl-3">
                                        {entries.map(({ resource, actions }) => (
                                          <div key={resource}>
                                            <p className="text-sm font-medium text-gray-800">
                                              {formatPermissionText(resource)}
                                            </p>
                                            <div className="flex flex-wrap gap-1 mt-1">
                                              {(actions || []).map((action) => (
                                                <span
                                                  key={action}
                                                  className="inline-block px-2 py-0.5 bg-white border border-gray-200 rounded text-xs text-gray-600"
                                                >
                                                  {formatPermissionText(action)}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Custom Roles Section */}
                <div className="border-t pt-7">
                  <div className="mb-3.5">
                    <h2 className="text-lg md:text-xl font-bold text-gray-900 flex items-center gap-2">
                      <Shield size={24} className="text-blue-500" />
                      Custom Roles
                    </h2>
                    <p className="text-sm text-gray-600 mt-0.5">Custom roles defined in the database</p>
                  </div>

                  {customPermissions.length === 0 ? (
                    <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
                      <p className="text-gray-600">No custom roles defined yet. Create one using the form below.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {(() => {
                        const grouped = {};
                        customPermissions.forEach((perm) => {
                          if (!grouped[perm.role]) grouped[perm.role] = {};
                          if (!grouped[perm.role][perm.resource]) grouped[perm.role][perm.resource] = [];
                          grouped[perm.role][perm.resource].push(perm.action);
                        });

                        return Object.entries(grouped).map(([role, resources]) => (
                          <div key={role} className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition">
                            <div className="flex items-center gap-2 mb-3 pb-3 border-b">
                              <span className="inline-block w-3 h-3 rounded-full bg-blue-500"></span>
                              <h4 className="text-sm md:text-base font-semibold text-gray-900">
                                {role.charAt(0).toUpperCase() + role.slice(1)}
                              </h4>
                            </div>
                            <div className="space-y-3">
                              {Object.entries(resources).map(([resource, actions]) => (
                                <div key={`${role}-${resource}`}>
                                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                                    {formatPermissionText(resource)}
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {actions.map((action) => (
                                      <span
                                        key={`${role}-${resource}-${action}`}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-xs font-medium text-blue-700 hover:bg-blue-100 transition group"
                                      >
                                        {formatPermissionText(action)}
                                        <button
                                          onClick={() => handleDeletePermission(role, resource, action)}
                                          disabled={deleting === `${role}-${resource}-${action}`}
                                          className="ml-1 opacity-0 group-hover:opacity-100 text-blue-500 hover:text-red-600 disabled:opacity-50 transition"
                                          title="Remove permission"
                                        >
                                          ✕
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>

                {/* Add/Edit Form Section */}
                <div className="border-t pt-7 mt-8">
                  <div className="mb-5">
                    <h2 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-3 mb-1.5">
                      <div className={`p-2 rounded-lg ${editTarget ? 'bg-blue-100' : 'bg-purple-100'}`}>
                        <Shield size={24} className={editTarget ? 'text-blue-600' : 'text-purple-600'} />
                      </div>
                      {editTarget ? 'Edit Permission' : 'Manage Role Permissions'}
                    </h2>
                    <p className="text-gray-600">
                      {editTarget
                        ? 'Modify permission details'
                        : 'Select a role, choose a resource, then configure permissions'}
                    </p>
                  </div>

                  <div className="bg-white rounded-lg border-2 border-gray-200 p-6 md:p-8 shadow-md">
                    <form className="space-y-6 md:space-y-8" onSubmit={handleAddPermission}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
                        <div>
                          <label className="block text-sm font-bold text-gray-900 mb-3 uppercase tracking-wide flex items-center gap-2">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary text-white text-xs font-bold">1</span>
                            Select or Create Role
                          </label>
                          <select
                            className="w-full px-3.5 py-2.5 text-sm border-2 border-gray-300 rounded-lg text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all hover:border-gray-400"
                            value={formData.role}
                            onChange={(e) => setFormData((prev) => ({ ...prev, role: e.target.value }))}
                          >
                            <option value="" disabled>Choose a role...</option>
                            {roleOptions.map((role) => (
                              <option key={role} value={role}>{formatPermissionText(role)}</option>
                            ))}
                            <option value="__new__">➕ Create new role...</option>
                          </select>
                          {formData.role === '__new__' && (
                            <input
                              type="text"
                              className="w-full mt-2 px-3.5 py-2 text-sm border-2 border-purple-300 rounded-lg text-gray-900 bg-purple-50 focus:outline-none focus:ring-2 focus:ring-purple-500"
                              placeholder="Enter new role name"
                              value={newRoleName}
                              onChange={(e) => setNewRoleName(e.target.value)}
                            />
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-bold text-gray-900 mb-3 uppercase tracking-wide flex items-center gap-2">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary text-white text-xs font-bold">2</span>
                            Select Resource/Module
                          </label>
                          <select
                            className="w-full px-3.5 py-2.5 text-sm border-2 border-gray-300 rounded-lg text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all hover:border-gray-400"
                            value={formData.resource}
                            onChange={(e) => setFormData((prev) => ({ ...prev, resource: e.target.value }))}
                          >
                            <option value="">Choose a resource...</option>
                            {resourceOptions.map((res) => (
                              <option key={res} value={res}>{formatPermissionText(res)}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {formData.resource && (
                        <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg border-2 border-purple-200 p-5 md:p-6">
                          <label className="block text-sm font-bold text-gray-900 mb-4 uppercase tracking-wide flex items-center gap-2">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary text-white text-xs font-bold">3</span>
                            Permissions for {formatPermissionText(formData.resource)}
                          </label>

                          <div className="mb-5 md:mb-6">
                            <h4 className="text-xs font-bold text-gray-700 uppercase mb-3 tracking-wider">Standard Actions</h4>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                              {['create', 'read', 'update', 'delete', 'manage_roles', 'publish', 'share', 'comment', 'export', 'configure', 'sync', 'terminate', 'reset_password', 'manage_status', 'manage', 'send_bulk'].map((action) => (
                                <button
                                  key={action}
                                  type="button"
                                  onClick={() => toggleAction(action)}
                                  className={`px-3 py-2 rounded-lg font-medium text-sm transition-all border-2 ${selectedActions.includes(action)
                                      ? 'border-primary bg-primary text-white shadow-md'
                                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                                    }`}
                                >
                                  {formatPermissionText(action)}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <h4 className="text-xs font-bold text-gray-700 uppercase mb-3 tracking-wider">Custom Actions (Optional)</h4>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                              {['view_reports', 'manage_members', 'send_notifications', 'edit_config', 'view_audit', 'manage_permissions', 'bulk_import', 'bulk_export', 'approve', 'reject', 'archive', 'restore'].map((action) => (
                                <button
                                  key={action}
                                  type="button"
                                  onClick={() => {
                                    if (customAction === action) {
                                      setCustomAction('');
                                    } else {
                                      setCustomAction(action);
                                    }
                                  }}
                                  className={`px-3 py-2 rounded-lg font-medium text-sm transition-all border-2 ${customAction === action
                                      ? 'border-green-500 bg-green-500 text-white shadow-md'
                                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                                    }`}
                                >
                                  {formatPermissionText(action)}
                                </button>
                              ))}
                            </div>
                          </div>

                          <p className="text-xs text-gray-600 mt-4 italic">
                            {selectedActions.length > 0 && `✓ ${selectedActions.length} standard action(s) selected`}
                            {customAction && ` + 1 custom action`}
                          </p>
                        </div>
                      )}

                      <div className="flex gap-3 pt-6 border-t-2 border-gray-200">
                        <button
                          type="submit"
                          disabled={formLoading || !formData.role || !formData.resource || (selectedActions.length === 0 && !customAction)}
                          className="flex-1 inline-flex items-center justify-center gap-2 bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-400 text-white px-5 py-3 rounded-lg font-bold disabled:opacity-60 transition-all shadow-md hover:shadow-lg disabled:shadow-none"
                        >
                          {formLoading ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              {editTarget ? 'Updating...' : 'Saving...'}
                            </>
                          ) : (
                            <>
                              <Plus size={18} />
                              {editTarget ? 'Update' : 'Add Permissions'}
                            </>
                          )}
                        </button>
                        {editTarget && (
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="px-5 py-3 rounded-lg border-2 border-gray-300 text-gray-700 hover:bg-gray-100 font-bold transition-all"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

