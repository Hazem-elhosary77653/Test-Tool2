'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store';
import api from '@/lib/api';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Toast from '@/components/Toast';
import useToast from '@/hooks/useToast';
import {
  User, Mail, Phone, MapPin, Camera, Lock, LogOut, Globe, Bell, Palette,
  Key, Shield, Smartphone, Monitor, Clock, X, Save, Edit2, Eye, EyeOff,
  ChevronRight, AlertCircle, CheckCircle
} from 'lucide-react';
import { SkeletonCard, Skeleton } from '@/components/ui/Skeleton';

export default function ProfilePage() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { toast, success, error: showError } = useToast();

  // Profile states
  const [editMode, setEditMode] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [profile, setProfile] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: '',
    bio: '',
    location: '',
    avatar: ''
  });

  // Settings states
  const [settings, setSettings] = useState({
    notifications: {
      email: true,
      sms: false,
      push: true,
      weekly_digest: true
    },
    theme: 'light',
    language: 'en'
  });

  // Password state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  });
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Devices state
  const [devices, setDevices] = useState([]);
  const [devicesLoading, setDevicesLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }

    fetchProfileData();
    fetchSettings();
    fetchDevices();
  }, [user, router]);

  const fetchProfileData = async () => {
    try {
      const response = await api.get(`/users/${user?.id}`);
      if (response?.data?.data) {
        const profileData = response.data.data;
        setProfile({
          name: profileData.name || user?.name || '',
          email: profileData.email || user?.email || '',
          phone: profileData.phone || '',
          bio: profileData.bio || '',
          location: profileData.location || '',
          avatar: profileData.avatar || ''
        });

        // Update auth store if avatar changed
        if (profileData.avatar) {
          useAuthStore.setState({
            user: { ...user, avatar: profileData.avatar, name: profileData.name }
          });
        }
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await api.get('/user-settings');
      if (response?.data?.data) {
        setSettings(response.data.data);
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  };

  const fetchDevices = async () => {
    try {
      setDevicesLoading(true);
      const response = await api.get('/auth/sessions').catch(() => ({ data: { data: [] } }));
      if (response?.data?.data) {
        setDevices(response.data.data);
      }
    } catch (err) {
      console.error('Error fetching devices:', err);
    } finally {
      setDevicesLoading(false);
    }
  };

  const handleProfileSave = async () => {
    try {
      setProfileLoading(true);
      const response = await api.put(`/users/${user?.id}`, profile);

      if (response?.data?.success) {
        success('Profile updated successfully!');
        setEditMode(false);
        // Refetch to confirm
        await fetchProfileData();
      } else {
        showError('Failed to update profile');
      }
    } catch (err) {
      showError(err.response?.data?.error || 'Failed to update profile');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showError('Please select an image file');
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      showError('Image size must be less than 5MB');
      return;
    }

    try {
      setAvatarUploading(true);

      // Create FormData
      const formData = new FormData();
      formData.append('avatar', file);

      // Upload avatar
      const response = await api.put(`/users/${user?.id}/avatar`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response?.data?.success) {
        const avatarUrl = response.data.data.avatar;
        setProfile({ ...profile, avatar: avatarUrl });
        success('Avatar updated successfully!');

        // Update auth store
        useAuthStore.setState({
          user: { ...user, avatar: avatarUrl }
        });
      } else {
        showError('Failed to upload avatar');
      }
    } catch (err) {
      console.error('Error uploading avatar:', err);
      showError(err.response?.data?.error || 'Failed to upload avatar');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSettingChange = async (key, value) => {
    try {
      const updatedSettings = { ...settings };
      if (key.includes('.')) {
        const [parent, child] = key.split('.');
        updatedSettings[parent][child] = value;
      } else {
        updatedSettings[key] = value;
      }

      const response = await api.put('/user-settings', updatedSettings);

      if (response?.data?.success) {
        setSettings(updatedSettings);
        success('Settings updated!');
        // Refetch to confirm
        await fetchSettings();
      } else {
        showError('Failed to update settings');
      }
    } catch (err) {
      console.error('Error updating setting:', err);
      showError('Failed to update settings');
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();

    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      showError('All fields are required');
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      showError('New passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 8) {
      showError('Password must be at least 8 characters long');
      return;
    }

    try {
      setPasswordLoading(true);
      await api.post('/auth/change-password', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      });

      success('Password changed successfully!');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      showError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleLogoutSession = async (sessionId) => {
    if (!confirm('Are you sure you want to logout from this device?')) return;

    try {
      await api.post(`/auth/sessions/${sessionId}/logout`).catch(() => { });
      success('Session ended');
      fetchDevices();
    } catch (err) {
      showError('Failed to end session');
    }
  };

  const handleLogoutAllDevices = async () => {
    if (!confirm('This will logout from all devices. Continue?')) return;

    try {
      await api.post('/auth/sessions/logout-all').catch(() => { });
      success('All sessions ended. Logging out...');
      setTimeout(() => {
        logout();
        router.push('/login');
      }, 2000);
    } catch (err) {
      showError('Failed to logout from all devices');
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <div className="p-6">
            <div className="max-w-6xl mx-auto space-y-6">
              {/* Toast */}
              {toast && (
                <Toast
                  message={toast.message}
                  type={toast.type}
                  duration={toast.duration}
                  onClose={() => { }}
                />
              )}

              {/* Page Header */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-primary rounded-lg shadow-sm">
                    <User size={24} className="text-white" />
                  </div>
                  <h1 className="text-3xl font-bold text-[var(--color-primary)]">
                    Profile & Settings
                  </h1>
                </div>
                <p className="text-[var(--color-text-muted)] ml-11">Manage your account, preferences, and security</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Sidebar Navigation */}
                <div className="lg:col-span-1">
                  <div className="bg-white rounded-xl border border-gray-200 p-6 sticky top-6 space-y-2">
                    <a href="#profile" className="flex items-center gap-3 px-4 py-3 rounded-lg bg-primary text-white transition">
                      <User size={20} />
                      <span className="font-medium">Profile</span>
                    </a>
                    <a href="#settings" className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-100 transition">
                      <Palette size={20} />
                      <span className="font-medium">Settings</span>
                    </a>
                    <a href="#password" className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-100 transition">
                      <Lock size={20} />
                      <span className="font-medium">Password</span>
                    </a>
                    <a href="#devices" className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-100 transition">
                      <Smartphone size={20} />
                      <span className="font-medium">Devices</span>
                    </a>
                  </div>
                </div>

                {/* Main Content */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Profile Section */}
                  <div id="profile" className="bg-white rounded-xl border border-gray-200 p-8">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-2xl font-bold text-gray-900">Profile Information</h2>
                      <button
                        onClick={() => setEditMode(!editMode)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${editMode
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                          }`}
                      >
                        {editMode ? (
                          <>
                            <X size={18} />
                            Cancel
                          </>
                        ) : (
                          <>
                            <Edit2 size={18} />
                            Edit
                          </>
                        )}
                      </button>
                    </div>

                    {/* Avatar */}
                    <div className="mb-8">
                      <div className="flex items-center gap-6">
                        {profile.avatar ? (
                          <img
                            src={`http://localhost:3001${profile.avatar}`}
                            alt="Avatar"
                            className="w-24 h-24 rounded-full object-cover shadow-lg"
                          />
                        ) : (
                          <div className="w-24 h-24 bg-gradient-to-br from-primary to-purple-600 rounded-full flex items-center justify-center text-white text-3xl font-bold shadow-lg">
                            {profile.name?.charAt(0).toUpperCase() || 'U'}
                          </div>
                        )}
                        {editMode && (
                          <label className={`flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition ${avatarUploading
                              ? 'bg-gray-300 cursor-not-allowed'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}>
                            <Camera size={18} />
                            {avatarUploading ? 'Uploading...' : 'Upload Photo'}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={handleAvatarUpload}
                              disabled={avatarUploading}
                            />
                          </label>
                        )}
                      </div>
                    </div>

                    {/* Form Fields */}
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-900 mb-2">Full Name</label>
                          <input
                            type="text"
                            value={profile.name}
                            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                            disabled={!editMode}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-900 mb-2">Email</label>
                          <input
                            type="email"
                            value={profile.email}
                            disabled
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 focus:outline-none cursor-not-allowed"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-900 mb-2">
                            <Phone size={16} className="inline mr-2" />
                            Phone
                          </label>
                          <input
                            type="tel"
                            value={profile.phone}
                            onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                            disabled={!editMode}
                            placeholder="+1 (555) 123-4567"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-900 mb-2">
                            <MapPin size={16} className="inline mr-2" />
                            Location
                          </label>
                          <input
                            type="text"
                            value={profile.location}
                            onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                            disabled={!editMode}
                            placeholder="City, Country"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">Bio</label>
                        <textarea
                          value={profile.bio}
                          onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                          disabled={!editMode}
                          placeholder="Tell us about yourself..."
                          rows={4}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                        />
                      </div>
                    </div>

                    {editMode && (
                      <div className="mt-6 flex gap-3">
                        <button
                          onClick={handleProfileSave}
                          disabled={profileLoading}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition font-medium"
                        >
                          {profileLoading ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save size={18} />
                              Save Changes
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Settings Section */}
                  <div id="settings" className="bg-white rounded-xl border border-gray-200 p-8">
                    <h2 className="text-2xl font-bold text-gray-900 mb-6">Preferences</h2>

                    {/* Notifications */}
                    <div className="mb-8 pb-8 border-b">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Bell size={20} />
                        Notifications
                      </h3>
                      <div className="space-y-3">
                        <label className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.notifications?.email}
                            onChange={(e) => handleSettingChange('notifications.email', e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-primary cursor-pointer"
                          />
                          <div>
                            <p className="font-medium text-gray-900">Email Notifications</p>
                            <p className="text-sm text-gray-600">Receive updates via email</p>
                          </div>
                        </label>
                        <label className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.notifications?.push}
                            onChange={(e) => handleSettingChange('notifications.push', e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-primary cursor-pointer"
                          />
                          <div>
                            <p className="font-medium text-gray-900">Push Notifications</p>
                            <p className="text-sm text-gray-600">Get instant notifications</p>
                          </div>
                        </label>
                        <label className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.notifications?.weekly_digest}
                            onChange={(e) => handleSettingChange('notifications.weekly_digest', e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-primary cursor-pointer"
                          />
                          <div>
                            <p className="font-medium text-gray-900">Weekly Digest</p>
                            <p className="text-sm text-gray-600">Summary every Monday</p>
                          </div>
                        </label>
                      </div>
                    </div>

                    {/* Theme */}
                    <div className="mb-8 pb-8 border-b">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Palette size={20} />
                        Theme
                      </h3>
                      <div className="flex gap-4">
                        {['light', 'dark'].map((mode) => (
                          <button
                            key={mode}
                            onClick={() => handleSettingChange('theme', mode)}
                            className={`flex-1 p-4 rounded-lg border-2 font-medium capitalize transition ${settings.theme === mode
                                ? 'border-primary bg-primary/5'
                                : 'border-gray-300 hover:border-gray-400'
                              }`}
                          >
                            {mode === 'light' ? '☀️' : '🌙'} {mode}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Language */}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Globe size={20} />
                        Language
                      </h3>
                      <select
                        value={settings.language}
                        onChange={(e) => handleSettingChange('language', e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="en">English</option>
                        <option value="es">Español</option>
                        <option value="fr">Français</option>
                        <option value="de">Deutsch</option>
                        <option value="ar">العربية</option>
                      </select>
                    </div>
                  </div>

                  {/* Password Section */}
                  <div id="password" className="bg-white rounded-xl border border-gray-200 p-8">
                    <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                      <Lock size={24} />
                      Change Password
                    </h2>

                    <form onSubmit={handlePasswordChange} className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">Current Password</label>
                        <div className="relative">
                          <input
                            type={showPasswords.current ? 'text' : 'password'}
                            value={passwordData.currentPassword}
                            onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
                            className="absolute right-3 top-2.5 text-gray-600"
                          >
                            {showPasswords.current ? <EyeOff size={20} /> : <Eye size={20} />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">New Password</label>
                        <div className="relative">
                          <input
                            type={showPasswords.new ? 'text' : 'password'}
                            value={passwordData.newPassword}
                            onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                            className="absolute right-3 top-2.5 text-gray-600"
                          >
                            {showPasswords.new ? <EyeOff size={20} /> : <Eye size={20} />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">Confirm New Password</label>
                        <div className="relative">
                          <input
                            type={showPasswords.confirm ? 'text' : 'password'}
                            value={passwordData.confirmPassword}
                            onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                            className="absolute right-3 top-2.5 text-gray-600"
                          >
                            {showPasswords.confirm ? <EyeOff size={20} /> : <Eye size={20} />}
                          </button>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={passwordLoading}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition font-medium"
                      >
                        {passwordLoading ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            Changing...
                          </>
                        ) : (
                          <>
                            <Key size={18} />
                            Change Password
                          </>
                        )}
                      </button>
                    </form>
                  </div>

                  {/* Devices Section */}
                  <div id="devices" className="bg-white rounded-xl border border-gray-200 p-8">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Smartphone size={24} />
                        Connected Devices
                      </h2>
                      <button
                        onClick={handleLogoutAllDevices}
                        className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition font-medium text-sm"
                      >
                        <LogOut size={16} className="inline mr-2" />
                        Logout All
                      </button>
                    </div>

                    {devicesLoading ? (
                      <div className="space-y-3">
                        {[1, 2].map((_, i) => (
                          <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                            <div className="flex items-center gap-4">
                              <Skeleton className="w-8 h-8" rounded="rounded-lg" />
                              <div className="space-y-2">
                                <Skeleton className="h-4 w-32" rounded="rounded" />
                                <Skeleton className="h-3 w-24" rounded="rounded" />
                              </div>
                            </div>
                            <Skeleton className="w-8 h-8" rounded="rounded-lg" />
                          </div>
                        ))}
                      </div>
                    ) : devices.length === 0 ? (
                      <p className="text-center text-gray-600 py-8">No active sessions</p>
                    ) : (
                      <div className="space-y-3">
                        {devices.map((device) => (
                          <div key={device.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                            <div className="flex items-center gap-4">
                              <Monitor size={24} className="text-gray-600" />
                              <div>
                                <p className="font-semibold text-gray-900">{device.device_name || 'Unknown Device'}</p>
                                <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                                  <Clock size={14} />
                                  {new Date(device.last_activity || Date.now()).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </div>
                                {device.is_current && (
                                  <span className="inline-block mt-2 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                                    Current Device
                                  </span>
                                )}
                              </div>
                            </div>
                            {!device.is_current && (
                              <button
                                onClick={() => handleLogoutSession(device.id)}
                                className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition"
                              >
                                <LogOut size={16} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
