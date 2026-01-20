'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store';
import api from '@/lib/api';
import {
  LayoutDashboard,
  FileText,
  BookOpen,
  FolderOpen,
  Zap,
  BarChart3,
  Settings,
  GitBranch,
  Shield,
  Users,
  User,
  Activity,
  ChevronLeft,
  ChevronRight,
  Bell
} from 'lucide-react';

const Sidebar = () => {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);
  const [allowedResources, setAllowedResources] = useState(null);

  useEffect(() => {
    const loadAccess = async () => {
      try {
        const res = await api.get('/permissions/accessible');
        const resources = res.data?.data?.resources || [];
        setAllowedResources(new Set(resources));
      } catch (err) {
        console.error('Failed to load accessible resources:', err);
        setAllowedResources(null); // fallback to showing everything
      }
    };

    loadAccess();
  }, []);

  const canAccess = (resource) => {
    if (!allowedResources || allowedResources.size === 0) return true; // fallback to visible
    return allowedResources.has(resource);
  };

  const resourceByHref = {
    '/dashboard': 'dashboard',
    '/dashboard/profile': 'profile',
    '/dashboard/user-stories': 'user_stories',
    '/dashboard/brds': 'brds',
    '/dashboard/templates': 'templates',
    '/dashboard/documents': 'documents',
    '/dashboard/diagrams': 'diagrams',
    '/dashboard/reports': 'reports',
    '/dashboard/ai-config': 'ai',
    '/dashboard/ai-stories': 'user_stories',
    '/dashboard/azure-devops': 'azure_devops',
    '/dashboard/settings': 'settings',
    '/dashboard/admin/users': 'users',
    '/dashboard/admin/activity': 'activity',
    '/dashboard/admin/permissions': 'permissions',
    '/dashboard/admin/notifications': 'notifications'
  };

  const sections = [
    {
      title: 'Workspace',
      items: [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/dashboard/ai-stories', label: 'Stories', icon: FileText },
        { href: '/dashboard/brds', label: 'BRDs', icon: BookOpen },
        { href: '/dashboard/templates', label: 'Templates', icon: FolderOpen },
        { href: '/dashboard/documents', label: 'Documents', icon: FolderOpen },
        { href: '/dashboard/diagrams', label: 'Diagrams', icon: GitBranch },
        { href: '/dashboard/reports', label: 'Reports', icon: BarChart3 },
        { href: '/dashboard/ai-config', label: 'AI Config', icon: Zap },
        { href: '/dashboard/azure-devops', label: 'Azure DevOps', icon: GitBranch },
        { href: '/dashboard/notifications', label: 'Notifications', icon: Bell },
      ],
    },
  ];

  const adminSection = {
    title: 'Admin',
    items: [
      { href: '/dashboard/admin/users', label: 'User Management', icon: Users },
      { href: '/dashboard/admin/activity', label: 'Activity Tracking', icon: Activity },
      { href: '/dashboard/admin/permissions', label: 'Permissions & Roles', icon: Shield },
      { href: '/dashboard/admin/notifications', label: 'Notification Management', icon: Settings },
    ],
  };

  const isActive = (href) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <aside className={`${collapsed ? 'w-18' : 'w-68'} bg-[var(--color-surface)] text-[var(--color-text)] shadow-2xl hidden md:block sticky top-0 h-screen overflow-y-auto border-r border-[var(--color-border)] transition-all duration-200`}
    >
      <nav className="p-4 space-y-6">
        <div className="flex items-center justify-between gap-2 px-1">
          {!collapsed && <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-muted)]">Menu</span>}
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] hover:bg-[var(--color-border)]/60 hover:border-[var(--color-border)] transition text-[var(--color-primary)]"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
        {sections.map((section) => (
          <div key={section.title} className="space-y-2">
            {!collapsed && (
              <p className="px-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400/80">
                {section.title}
              </p>
            )}
            <div className="space-y-1">
              {section.items.filter(({ href }) => canAccess(resourceByHref[href] || '')).map(({ href, label, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`group relative flex items-center gap-3 px-4 py-3 rounded-2xl transition border ${active
                      ? 'bg-[var(--color-primary)]/8 text-[var(--color-text)] border-[var(--color-accent)]/50 shadow-md shadow-[var(--color-primary)]/10 ring-1 ring-[var(--color-accent)]/40'
                      : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-strong)] hover:border-[var(--color-border)]'
                      }`}
                  >
                    <span className={`absolute inset-y-2 left-2 w-1 rounded-full transition ${active ? 'bg-[var(--color-accent)]' : 'bg-transparent group-hover:bg-[var(--color-accent)]/60'}`}></span>
                    <div className="h-9 w-9 rounded-xl flex items-center justify-center bg-[var(--color-surface-strong)] border border-[var(--color-border)] group-hover:border-[var(--color-accent)]/60 transition">
                      <Icon size={18} className="shrink-0" />
                    </div>
                    {!collapsed && <span className="truncate">{label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {(user?.role === 'admin' || canAccess('users')) && (
          <div className="space-y-2 pt-3 border-t border-[var(--color-border)]">
            {!collapsed && <p className="px-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400/80">{adminSection.title}</p>}
            <div className="space-y-1">
              {adminSection.items
                .filter(({ href }) => canAccess(resourceByHref[href] || ''))
                .map(({ href, label, icon: Icon }) => {
                  const active = isActive(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`group relative flex items-center gap-3 px-4 py-3 rounded-2xl transition border ${active
                        ? 'bg-[var(--color-primary)]/8 text-[var(--color-text)] border-[var(--color-accent)]/50 shadow-md shadow-[var(--color-primary)]/10 ring-1 ring-[var(--color-accent)]/40'
                        : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-strong)] hover:border-[var(--color-border)]'
                        }`}
                    >
                      <span className={`absolute inset-y-2 left-2 w-1 rounded-full transition ${active ? 'bg-[var(--color-accent)]' : 'bg-transparent group-hover:bg-[var(--color-accent)]/60'}`}></span>
                      <div className="h-9 w-9 rounded-xl flex items-center justify-center bg-[var(--color-surface-strong)] border border-[var(--color-border)] group-hover:border-[var(--color-accent)]/60 transition">
                        <Icon size={18} className="shrink-0" />
                      </div>
                      {!collapsed && <span className="truncate">{label}</span>}
                    </Link>
                  );
                })}
            </div>
          </div>
        )}
      </nav>
    </aside>
  );
};

export default Sidebar;
