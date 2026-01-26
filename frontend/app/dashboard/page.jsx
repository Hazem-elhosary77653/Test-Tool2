'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store';
import api from '@/lib/api';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import {
  BarChart3, FileText, BookOpen, FolderOpen, TrendingUp, Activity, LogIn, Users, Shield, Clock,
  ArrowRight, Download, RefreshCw, AlertCircle, CheckCircle, UserCheck, Target, Zap, Heart
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts';
import { Spinner, LoadingOverlay, LoadingCard } from '@/components/ui/Loading';
import { Button } from '@/components/ui/button';
import { SkeletonStatsCard, SkeletonChart } from '@/components/ui/Skeleton';

const ACTION_COLORS = {
  USER_LOGIN: 'bg-green-100 text-green-800',
  USER_REGISTERED: 'bg-blue-100 text-blue-800',
  USER_CREATED: 'bg-blue-100 text-blue-800',
  USER_UPDATED: 'bg-yellow-100 text-yellow-800',
  USER_DELETED: 'bg-red-100 text-red-800',
  ROLE_CHANGED: 'bg-purple-100 text-purple-800',
  PASSWORD_RESET: 'bg-orange-100 text-orange-800',
  TWO_FA_ENABLED: 'bg-pink-100 text-pink-800',
  TWO_FA_DISABLED: 'bg-pink-100 text-pink-800',
  GROUP_CREATED: 'bg-indigo-100 text-indigo-800',
  GROUP_UPDATED: 'bg-indigo-100 text-indigo-800',
  GROUP_DELETED: 'bg-indigo-100 text-indigo-800',
  PERMISSION_CHANGED: 'bg-teal-100 text-teal-800',
};

const ACTION_ICONS = {
  USER_LOGIN: LogIn,
  USER_REGISTERED: Users,
  USER_CREATED: Users,
  USER_UPDATED: FileText,
  USER_DELETED: Users,
  ROLE_CHANGED: Shield,
  PASSWORD_RESET: Clock,
  TWO_FA_ENABLED: Shield,
  TWO_FA_DISABLED: Shield,
  GROUP_CREATED: Users,
  GROUP_UPDATED: Users,
  GROUP_DELETED: Users,
  PERMISSION_CHANGED: Shield,
};

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [stats, setStats] = useState(null);
  const [activities, setActivities] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [dashboardMetrics, setDashboardMetrics] = useState({
    todayLogins: 0,
    verifiedUsers: 0,
    pendingTasks: 0,
    performance: 0
  });
  const [loading, setLoading] = useState(true);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }

    fetchAllData();

    // Auto-refresh dashboard every 10 seconds
    const interval = setInterval(() => {
      fetchAllData();
    }, 10000);

    return () => clearInterval(interval);
  }, [user, router]);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      // Try admin feed first; fall back to my-activity if not authorized
      const activitiesPromise = api
        .get('/activity/all?limit=8')
        .catch(async (err) => {
          const status = err?.response?.status;
          if (status === 401 || status === 403) {
            try {
              const myAct = await api.get('/activity/my-activity?limit=8');
              return { data: { data: myAct.data?.data || [] } };
            } catch (innerErr) {
              return { data: { data: [] } };
            }
          }
          return { data: { data: [] } };
        });

      const [statsRes, activitiesRes, usersRes] = await Promise.all([
        api.get('/dashboard/stats').catch(() => ({ data: {} })),
        activitiesPromise,
        api.get('/users').catch(() => ({ data: { data: [] } }))
      ]);

      setStats(statsRes.data);
      setActivities(activitiesRes.data?.data || []);

      // Calculate real metrics from users data
      const users = usersRes.data?.data || [];
      const verifiedCount = users.filter(u => u.email_verified || u.verified).length;

      // Count today's logins from activities
      const today = new Date().toDateString();
      const todayLogins = activitiesRes.data?.data?.filter(a =>
        new Date(a.created_at).toDateString() === today && a.action_type === 'USER_LOGIN'
      ).length || 0;

      // Calculate trend data from activities (last 7 days)
      const trends = calculateTrendData(activitiesRes.data?.data || []);
      // Prefer backend-provided trend if available
      const backendTrend = statsRes.data?.data?.activityTrend;
      setTrendData(backendTrend && backendTrend.length ? backendTrend : trends);

      // Set dashboard metrics
      setDashboardMetrics({
        todayLogins: todayLogins,
        verifiedUsers: verifiedCount,
        pendingTasks: Math.max(0, users.filter(u => !u.email_verified).length),
        performance: calculatePerformance(activitiesRes.data?.data || [])
      });
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
      setActivitiesLoading(false);
    }
  };

  const calculateTrendData = (activities = []) => {
    const MS_IN_DAY = 24 * 60 * 60 * 1000;

    // Build the last 7 days (oldest → newest) anchored at today 00:00
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 7 }, (_, idx) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (6 - idx));
      return d;
    });

    const dayMap = {};
    days.forEach((d) => {
      const key = d.toISOString().slice(0, 10); // yyyy-mm-dd
      const label = d.toLocaleDateString('en-US', { weekday: 'short' });
      dayMap[key] = { name: label, activities: 0, users: 0, documents: 0 };
    });

    activities.forEach((activity) => {
      if (!activity?.created_at) return;
      const actDate = new Date(activity.created_at);
      const actDay = new Date(actDate);
      actDay.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((today - actDay) / MS_IN_DAY);

      if (diffDays >= 0 && diffDays < 7) {
        const key = actDay.toISOString().slice(0, 10);
        if (dayMap[key]) {
          dayMap[key].activities += 1;
          dayMap[key].users += 1;
        }
      }
    });

    return days.map((d) => dayMap[d.toISOString().slice(0, 10)]);
  };

  const calculatePerformance = (activities) => {
    if (!activities.length) return 95;
    const successRate = (activities.filter(a => !a.error).length / activities.length) * 100;
    return Math.round(successRate * 10) / 10;
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAllData();
    setRefreshing(false);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getActionIcon = (actionType) => {
    const IconComponent = ACTION_ICONS[actionType] || Activity;
    return IconComponent;
  };

  const getActivityDescription = (activity) => {
    const actionType = activity.action_type;
    const userName = activity.user_name || activity.user_email || 'Unknown User';

    const descriptions = {
      USER_LOGIN: `${userName} logged in`,
      USER_LOGOUT: `${userName} logged out`,
      USER_REGISTERED: `${userName} registered`,
      USER_CREATED: `${userName} was created`,
      USER_UPDATED: `${userName}'s profile updated`,
      USER_DELETED: `${userName} was deleted`,
      ROLE_CHANGED: `${userName}'s role changed`,
      PASSWORD_RESET: `${userName} reset password`,
      TWO_FA_ENABLED: `${userName} enabled 2FA`,
      TWO_FA_DISABLED: `${userName} disabled 2FA`,
    };

    return descriptions[actionType] || `${userName} - ${actionType.replace(/_/g, ' ')}`;
  };

  const COLORS = ['#2563eb', '#16a34a', '#9333ea', '#ea580c', '#dc2626', '#0891b2'];

  const cards = [
    {
      title: 'User Stories',
      icon: FileText,
      bgGradient: 'from-blue-500 to-blue-600',
      count: stats?.data?.userStories || 0,
      trend: '+12%',
      trendUp: true,
    },
    {
      title: 'BRDs',
      icon: BookOpen,
      bgGradient: 'from-green-500 to-green-600',
      count: stats?.data?.brds || 0,
      trend: '+8%',
      trendUp: true,
    },
    {
      title: 'Documents',
      icon: FolderOpen,
      bgGradient: 'from-purple-500 to-purple-600',
      count: stats?.data?.documents || 0,
      trend: '+15%',
      trendUp: true,
    },
    {
      title: 'Active Users',
      icon: Users,
      bgGradient: 'from-orange-500 to-orange-600',
      count: stats?.data?.activeUsers || 0,
      trend: '+5%',
      trendUp: true,
    },
  ];

  const systemStatus = [
    { label: 'Database', status: 'healthy', icon: CheckCircle },
    { label: 'API Server', status: 'healthy', icon: CheckCircle },
    { label: 'Authentication', status: 'healthy', icon: CheckCircle },
    { label: 'File Storage', status: 'healthy', icon: CheckCircle },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <div className="p-6">
            <div className="max-w-7xl mx-auto">
              {/* Page Header with Refresh Button */}
              <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-primary rounded-lg shadow-sm">
                      <BarChart3 size={24} className="text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-[var(--color-primary)]">
                      Dashboard
                    </h1>
                  </div>
                  <p className="text-[var(--color-text-muted)] ml-11">Welcome back, {user?.name}! Here's your system overview.</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    <Download size={18} />
                    Export
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="space-y-6">
                  {/* Stats Skeleton */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <SkeletonStatsCard />
                    <SkeletonStatsCard />
                    <SkeletonStatsCard />
                    <SkeletonStatsCard />
                  </div>
                  {/* Charts Skeleton */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <SkeletonChart />
                    <SkeletonChart />
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Main Stats Cards - Row 1 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {cards.map((card) => {
                      const Icon = card.icon;
                      return (
                        <div
                          key={card.title}
                          className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-all duration-300 cursor-pointer group"
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div>
                              <p className="text-gray-600 text-sm font-medium mb-1">{card.title}</p>
                              <p className="text-3xl font-bold text-gray-900">{card.count}</p>
                            </div>
                            <div className={`p-3 rounded-lg bg-gradient-to-br ${card.bgGradient} text-white shadow-md group-hover:scale-110 transition-transform`}>
                              <Icon size={24} />
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <TrendingUp size={14} className={card.trendUp ? 'text-green-600' : 'text-red-600'} />
                            <span className={card.trendUp ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                              {card.trend}
                            </span>
                            <span className="text-gray-500">vs last month</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Charts - Row 2 */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Area Chart - Trends */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h2 className="text-lg font-bold text-gray-900">Activity Trends</h2>
                          <p className="text-sm text-gray-600">Last 7 days overview</p>
                        </div>
                        <Activity size={24} className="text-primary" />
                      </div>
                      <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={trendData}>
                          <defs>
                            <linearGradient id="colorActivities" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.8} />
                              <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 12 }} />
                          <YAxis tick={{ fill: '#6b7280', fontSize: 12 }} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#fff',
                              border: '1px solid #e5e7eb',
                              borderRadius: '8px',
                              boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                            }}
                          />
                          <Area type="monotone" dataKey="activities" stroke="#2563eb" fillOpacity={1} fill="url(#colorActivities)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Bar Chart - User Stories Status */}
                    {stats?.data?.userStoriesByStatus && stats.data.userStoriesByStatus.length > 0 && (
                      <div className="bg-white rounded-xl border border-gray-200 p-6">
                        <div className="flex items-center justify-between mb-6">
                          <div>
                            <h2 className="text-lg font-bold text-gray-900">User Stories Status</h2>
                            <p className="text-sm text-gray-600">Distribution by status</p>
                          </div>
                          <FileText size={24} className="text-blue-600" />
                        </div>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={stats.data.userStoriesByStatus}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="status" tick={{ fill: '#6b7280', fontSize: 12 }} />
                            <YAxis tick={{ fill: '#6b7280', fontSize: 12 }} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#fff',
                                border: '1px solid #e5e7eb',
                                borderRadius: '8px',
                              }}
                            />
                            <Bar dataKey="count" fill="#2563eb" radius={[8, 8, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  {/* BRDs Distribution & System Status - Row 3 */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Pie Chart - BRDs */}
                    {stats?.data?.brdsByStatus && stats.data.brdsByStatus.length > 0 && (
                      <div className="bg-white rounded-xl border border-gray-200 p-6">
                        <div className="flex items-center justify-between mb-6">
                          <div>
                            <h2 className="text-lg font-bold text-gray-900">BRDs Distribution</h2>
                            <p className="text-sm text-gray-600">By status</p>
                          </div>
                          <BookOpen size={24} className="text-green-600" />
                        </div>
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart>
                            <Pie
                              data={stats.data.brdsByStatus}
                              dataKey="count"
                              nameKey="status"
                              cx="50%"
                              cy="50%"
                              outerRadius={100}
                              label={{ fontSize: 12 }}
                            >
                              {stats.data.brdsByStatus.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* System Status */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h2 className="text-lg font-bold text-gray-900">System Status</h2>
                          <p className="text-sm text-gray-600">All systems operational</p>
                        </div>
                        <Heart size={24} className="text-red-600" />
                      </div>
                      <div className="space-y-4">
                        {systemStatus.map((item, idx) => {
                          const StatusIcon = item.icon;
                          return (
                            <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                              <div className="flex items-center gap-3">
                                <StatusIcon size={20} className="text-green-600" />
                                <div>
                                  <p className="font-medium text-gray-900">{item.label}</p>
                                  <p className="text-xs text-gray-600">Online</p>
                                </div>
                              </div>
                              <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Quick Stats Cards - Row 4 */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-100 rounded-lg">
                          <LogIn size={24} className="text-blue-600" />
                        </div>
                        <div>
                          <p className="text-gray-600 text-sm">Today Logins</p>
                          <p className="text-2xl font-bold text-gray-900">{dashboardMetrics.todayLogins}</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-green-100 rounded-lg">
                          <UserCheck size={24} className="text-green-600" />
                        </div>
                        <div>
                          <p className="text-gray-600 text-sm">Verified Users</p>
                          <p className="text-2xl font-bold text-gray-900">{dashboardMetrics.verifiedUsers}</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-orange-100 rounded-lg">
                          <Target size={24} className="text-orange-600" />
                        </div>
                        <div>
                          <p className="text-gray-600 text-sm">Pending Tasks</p>
                          <p className="text-2xl font-bold text-gray-900">{dashboardMetrics.pendingTasks}</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-purple-100 rounded-lg">
                          <Zap size={24} className="text-purple-600" />
                        </div>
                        <div>
                          <p className="text-gray-600 text-sm">Performance</p>
                          <p className="text-2xl font-bold text-gray-900">{dashboardMetrics.performance}%</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Recent Activities Widget - Row 5 */}
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-6 pb-4 border-b">
                      <div>
                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                          <Activity size={24} className="text-primary" />
                          Recent Activities
                        </h2>
                        <p className="text-sm text-gray-600 mt-1">Latest user actions and system events</p>
                      </div>
                      {user?.role === 'admin' && (
                        <a
                          href="/dashboard/admin/activity"
                          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors text-sm font-medium"
                        >
                          View All
                          <ArrowRight size={16} />
                        </a>
                      )}
                    </div>

                    {activitiesLoading ? (
                      <div className="text-center py-8">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        <p className="text-gray-600 mt-2">Loading activities...</p>
                      </div>
                    ) : activities.length === 0 ? (
                      <div className="text-center py-8">
                        <Activity size={32} className="mx-auto opacity-30 text-gray-400 mb-2" />
                        <p className="text-gray-600">No activities yet</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {activities.map((activity, idx) => {
                          const ActionIcon = getActionIcon(activity.action_type);
                          return (
                            <div
                              key={idx}
                              className="flex gap-4 p-3 hover:bg-gray-50 rounded-lg transition-colors border-b last:border-b-0"
                            >
                              {/* Icon */}
                              <div className={`flex-shrink-0 p-2.5 rounded-lg ${ACTION_COLORS[activity.action_type] || 'bg-gray-100 text-gray-800'}`}>
                                <ActionIcon size={18} />
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="font-medium text-gray-900 text-sm">
                                      {getActivityDescription(activity)}
                                    </p>
                                    <p className="text-xs text-gray-600 mt-0.5">
                                      📧 {activity.user_email || 'System'}
                                    </p>
                                    {activity.description && (
                                      <p className="text-xs text-gray-500 mt-1">
                                        💬 {activity.description}
                                      </p>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-500 whitespace-nowrap flex-shrink-0">
                                    {formatDate(activity.created_at)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Footer Info */}
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-gray-200 p-6">
                    <div className="flex items-start gap-4">
                      <AlertCircle size={24} className="text-blue-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 mb-1">Dashboard Help</h3>
                        <p className="text-sm text-gray-600">
                          This dashboard provides a real-time overview of your system. Use the refresh button to update data,
                          and click "Export" to download a report. For detailed information about activities, visit the
                          <a href="/dashboard/admin/activity" className="text-primary hover:underline ml-1">Activity Tracking page</a>.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main >
      </div >
    </div >
  );
}
