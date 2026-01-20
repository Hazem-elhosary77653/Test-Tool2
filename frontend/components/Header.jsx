'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store';
import { Menu, LogOut, Settings, User, Bell } from 'lucide-react';
import api from '@/lib/api';
import NotificationBell from './NotificationBell';
import { useState, useRef, useEffect } from 'react';
import ProjectChat from './ProjectChat';

export default function Header() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      // proceed even if API call fails
    }
    logout();
    router.push('/login');
  };

  // Get first letter of username for avatar
  const getAvatarText = () => {
    if (user?.name) return user.name.charAt(0).toUpperCase();
    if (user?.username) return user.username.charAt(0).toUpperCase();
    if (user?.email) return user.email.charAt(0).toUpperCase();
    return 'U';
  };

  return (
    <header className="sticky top-0 z-40 bg-[var(--color-surface)]/92 backdrop-blur border-b border-[var(--color-border)] shadow-soft">
      <div className="flex items-center justify-between px-6 py-4">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white font-bold shadow-sm ring-1 ring-primary/25">
            BA
          </div>
          <div className="hidden sm:block">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-muted)] leading-tight">Business Analyst</p>
            <p className="text-lg font-semibold text-[var(--color-text)] leading-tight">Workspace</p>
          </div>
        </Link>

        <div className="flex items-center gap-4">
          <NotificationBell />
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="flex items-center gap-2 p-2 pr-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-strong)] hover:bg-[var(--color-border)]/60 transition"
              aria-label="Open menu"
              type="button"
            >
              {/* Avatar */}
              {user?.avatar ? (
                <img
                  src={user.avatar.startsWith('http') ? user.avatar : `http://localhost:3001${user.avatar}`}
                  alt="Avatar"
                  className="w-8 h-8 rounded-full object-cover shadow-sm"
                  onError={(e) => {
                    console.log('Avatar load error, showing fallback');
                    e.target.style.display = 'none';
                    if (e.target.nextElementSibling) {
                      e.target.nextElementSibling.style.display = 'flex';
                    }
                  }}
                />
              ) : null}
              <div
                className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white text-sm font-semibold shadow-sm"
                style={{ display: user?.avatar ? 'none' : 'flex' }}
              >
                {getAvatarText()}
              </div>

              {/* Hi, Username */}
              <div className="hidden md:flex flex-col items-start leading-tight">
                <span className="text-xs text-[var(--color-text-muted)]">Hi,</span>
                <span className="text-sm font-semibold text-[var(--color-text)]">
                  {user?.name || user?.username || user?.email?.split('@')[0]}
                </span>
              </div>

              <Menu size={18} className="text-[var(--color-text-muted)]" />
            </button>

            {showMenu && (
              <div className="absolute right-0 mt-2 top-full w-56 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-card overflow-hidden">
                {/* User Info Section */}
                <div className="px-4 py-3 border-b border-[var(--color-border)] bg-gradient-to-r from-primary/5 to-purple-500/5">
                  <div className="flex items-center gap-3">
                    {user?.avatar ? (
                      <img
                        src={`http://localhost:3001${user.avatar}`}
                        alt="Avatar"
                        className="w-10 h-10 rounded-full object-cover shadow-sm"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div
                      className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white font-semibold shadow-sm"
                      style={{ display: user?.avatar ? 'none' : 'flex' }}
                    >
                      {getAvatarText()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--color-text)] truncate">
                        {user?.name || user?.username || 'User'}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)] truncate">
                        {user?.email}
                      </p>
                      <p className="text-xs text-primary font-medium">
                        {user?.role || 'User'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* User Settings */}
                <div className="py-1">
                  <Link
                    href="/dashboard/profile"
                    className="block px-4 py-2.5 hover:bg-[var(--color-surface-strong)] transition flex items-center gap-3 text-[var(--color-text)]"
                    onClick={() => setShowMenu(false)}
                  >
                    <User size={18} className="text-primary" />
                    <span className="text-sm">My Profile</span>
                  </Link>

                  <Link
                    href="/dashboard/settings"
                    className="block px-4 py-2.5 hover:bg-[var(--color-surface-strong)] transition flex items-center gap-3 text-[var(--color-text)]"
                    onClick={() => setShowMenu(false)}
                  >
                    <Settings size={18} className="text-primary" />
                    <span className="text-sm">My Settings</span>
                  </Link>
                </div>

                {/* Admin Settings (only for admin) */}
                {user?.role === 'admin' && (
                  <>
                    <div className="border-t border-[var(--color-border)] my-1"></div>
                    <div className="py-1">
                      <Link
                        href="/dashboard/system-settings"
                        className="block px-4 py-2.5 hover:bg-[var(--color-surface-strong)] transition flex items-center gap-3 text-[var(--color-text)]"
                        onClick={() => setShowMenu(false)}
                      >
                        <Settings size={18} className="text-orange-500" />
                        <span className="text-sm">System Settings</span>
                      </Link>
                    </div>
                  </>
                )}

                {/* Logout */}
                <div className="border-t border-[var(--color-border)] mt-1 pt-1">
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2.5 hover:bg-red-50 transition flex items-center gap-3 text-danger"
                    type="button"
                  >
                    <LogOut size={18} />
                    <span className="text-sm font-medium">Logout</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <ProjectChat />
    </header>
  );
}
