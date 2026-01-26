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
  FileText, Download, Calendar, Filter, TrendingUp, Users, Activity, BarChart3,
  Clock, CheckCircle, AlertCircle, Share2, RefreshCw
} from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import { SkeletonStatsCard, SkeletonChart, SkeletonCardList } from '@/components/ui/Skeleton';

export default function ReportsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { toast, success, error: showError } = useToast();

  // State management
  const [reports, setReports] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Filters
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [reportType, setReportType] = useState('activity');
  const [chartData, setChartData] = useState([]);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }

    if (user.role !== 'admin') {
      router.push('/dashboard');
      return;
    }

    fetchReportData();
  }, [user, router, dateRange, reportType]);

  const fetchReportData = async () => {
    try {
      setLoading(true);
      const [activitiesRes, statsRes] = await Promise.all([
        api.get('/activity/all').catch(() => ({ data: { data: [] } })),
        api.get('/dashboard/stats').catch(() => ({ data: {} }))
      ]);

      const activities = activitiesRes.data?.data || [];
      setActivities(activities);

      // Generate chart data
      generateChartData(activities);

      // Generate summary reports
      generateSummaryReports(activities, statsRes.data);
    } catch (err) {
      console.error('Error fetching report data:', err);
      showError('Failed to fetch report data');
    } finally {
      setLoading(false);
    }
  };

  const generateChartData = (activities) => {
    const startDate = new Date(dateRange.startDate);
    const endDate = new Date(dateRange.endDate);

    // Filter activities within date range
    const filteredByDate = activities.filter(a => {
      const actDate = new Date(a.created_at);
      return actDate >= startDate && actDate <= endDate;
    });

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dayMap = {};

    days.forEach(day => {
      dayMap[day] = { name: day, logins: 0, activities: 0, errors: 0 };
    });

    // Count activities per day of week
    filteredByDate.forEach(activity => {
      const actDate = new Date(activity.created_at);
      const dayOfWeek = actDate.getDay();
      const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert to Mon-Sun
      const day = days[dayIndex];

      if (activity.action_type === 'USER_LOGIN') dayMap[day].logins += 1;
      dayMap[day].activities += 1;
      if (activity.error) dayMap[day].errors += 1;
    });

    setChartData(days.map(day => dayMap[day]));
  };

  const generateSummaryReports = (activities, stats) => {
    const today = new Date().toDateString();
    const thisMonth = new Date().getMonth();

    const summaryReports = [
      {
        id: 1,
        title: 'Daily Activity Report',
        type: 'activity',
        description: 'Summary of activities for today',
        date: new Date().toLocaleDateString(),
        metrics: {
          totalActivities: activities.filter(a => new Date(a.created_at).toDateString() === today).length,
          logins: activities.filter(a => a.action_type === 'USER_LOGIN' && new Date(a.created_at).toDateString() === today).length,
          errors: 0
        }
      },
      {
        id: 2,
        title: 'User Management Report',
        type: 'users',
        description: 'User creation, updates, and deletions',
        date: new Date().toLocaleDateString(),
        metrics: {
          created: activities.filter(a => a.action_type === 'USER_CREATED').length,
          updated: activities.filter(a => a.action_type === 'USER_UPDATED').length,
          deleted: activities.filter(a => a.action_type === 'USER_DELETED').length
        }
      },
      {
        id: 3,
        title: 'Security Report',
        type: 'security',
        description: 'Password resets and 2FA activities',
        date: new Date().toLocaleDateString(),
        metrics: {
          passwordResets: activities.filter(a => a.action_type === 'PASSWORD_RESET').length,
          twoFAEnabled: activities.filter(a => a.action_type === 'TWO_FA_ENABLED').length,
          roleChanges: activities.filter(a => a.action_type === 'ROLE_CHANGED').length
        }
      },
      {
        id: 4,
        title: 'System Health Report',
        type: 'health',
        description: 'System performance and availability',
        date: new Date().toLocaleDateString(),
        metrics: {
          uptime: '99.8%',
          avgResponseTime: '142ms',
          successRate: '99.5%'
        }
      }
    ];

    setReports(summaryReports);
  };

  const handleExportPDF = async (reportId) => {
    try {
      setGenerating(true);
      // Simulate PDF generation
      await new Promise(resolve => setTimeout(resolve, 1500));

      const report = reports.find(r => r.id === reportId);
      const content = `
        ${report.title}
        Date: ${report.date}
        
        Metrics:
        ${Object.entries(report.metrics).map(([key, value]) => `${key}: ${value}`).join('\n')}
      `;

      const element = document.createElement('a');
      element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
      element.setAttribute('download', `${report.title}.txt`);
      element.style.display = 'none';
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);

      success('Report exported successfully!');
    } catch (err) {
      showError('Failed to export report');
    } finally {
      setGenerating(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      setGenerating(true);
      await new Promise(resolve => setTimeout(resolve, 1500));

      const filtered = activities.filter(a => {
        const actDate = a.created_at.split('T')[0];
        return actDate >= dateRange.startDate && actDate <= dateRange.endDate;
      });

      const csv = [
        ['Date', 'Action', 'User', 'Email', 'Description'],
        ...filtered.map(a => [
          new Date(a.created_at).toLocaleString(),
          a.action_type,
          a.user_name || 'System',
          a.user_email || '-',
          a.description || '-'
        ])
      ].map(row => row.join(',')).join('\n');

      const element = document.createElement('a');
      element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv));
      element.setAttribute('download', `activity-report-${dateRange.startDate}.csv`);
      element.style.display = 'none';
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);

      success('CSV exported successfully!');
    } catch (err) {
      showError('Failed to export CSV');
    } finally {
      setGenerating(false);
    }
  };

  const filteredActivities = activities.filter(a => {
    const actDate = a.created_at.split('T')[0];
    return actDate >= dateRange.startDate && actDate <= dateRange.endDate;
  });

  const actionSummary = {
    logins: filteredActivities.filter(a => a.action_type === 'USER_LOGIN').length,
    creations: filteredActivities.filter(a => a.action_type === 'USER_CREATED').length,
    updates: filteredActivities.filter(a => a.action_type === 'USER_UPDATED').length,
    deletions: filteredActivities.filter(a => a.action_type === 'USER_DELETED').length
  };

  if (!user || user.role !== 'admin') {
    return null;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <div className="p-6">
            <div className="max-w-7xl mx-auto space-y-6">
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
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-primary rounded-lg shadow-sm">
                      <BarChart3 size={24} className="text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-[var(--color-primary)]">
                      Reports & Analytics
                    </h1>
                  </div>
                  <p className="text-[var(--color-text-muted)] ml-11">Generate and export system reports</p>
                </div>
              </div>

              {/* Filters */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Filter size={20} />
                  Filters
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">Start Date</label>
                    <input
                      type="date"
                      value={dateRange.startDate}
                      onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">End Date</label>
                    <input
                      type="date"
                      value={dateRange.endDate}
                      onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">Report Type</label>
                    <select
                      value={reportType}
                      onChange={(e) => setReportType(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="activity">Activity Report</option>
                      <option value="users">User Report</option>
                      <option value="security">Security Report</option>
                      <option value="health">System Health</option>
                    </select>
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <SkeletonStatsCard />
                    <SkeletonStatsCard />
                    <SkeletonStatsCard />
                    <SkeletonStatsCard />
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <SkeletonChart />
                    <SkeletonChart />
                  </div>
                </div>
              ) : (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-100 rounded-lg">
                          <Activity size={24} className="text-blue-600" />
                        </div>
                        <div>
                          <p className="text-gray-600 text-sm">Total Activities</p>
                          <p className="text-3xl font-bold text-gray-900">{filteredActivities.length}</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-green-100 rounded-lg">
                          <Users size={24} className="text-green-600" />
                        </div>
                        <div>
                          <p className="text-gray-600 text-sm">User Logins</p>
                          <p className="text-3xl font-bold text-gray-900">{actionSummary.logins}</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-yellow-100 rounded-lg">
                          <TrendingUp size={24} className="text-yellow-600" />
                        </div>
                        <div>
                          <p className="text-gray-600 text-sm">Users Created</p>
                          <p className="text-3xl font-bold text-gray-900">{actionSummary.creations}</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-purple-100 rounded-lg">
                          <BarChart3 size={24} className="text-purple-600" />
                        </div>
                        <div>
                          <p className="text-gray-600 text-sm">Avg Daily</p>
                          <p className="text-3xl font-bold text-gray-900">
                            {Math.round(filteredActivities.length / (new Date(dateRange.endDate).getDate() - new Date(dateRange.startDate).getDate() + 1))}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Charts */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                      <h3 className="text-lg font-bold text-gray-900 mb-4">Activity Trends</h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="logins" stroke="#2563eb" strokeWidth={2} />
                          <Line type="monotone" dataKey="activities" stroke="#16a34a" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                      <h3 className="text-lg font-bold text-gray-900 mb-4">Action Breakdown</h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={[
                          { name: 'Logins', value: actionSummary.logins },
                          { name: 'Created', value: actionSummary.creations },
                          { name: 'Updated', value: actionSummary.updates },
                          { name: 'Deleted', value: actionSummary.deletions }
                        ]}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="value" fill="#2563eb" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Reports List */}
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <FileText size={24} />
                        Generated Reports
                      </h3>
                      <div className="flex gap-2">
                        <button
                          onClick={handleExportCSV}
                          disabled={generating}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 disabled:opacity-50 transition font-medium"
                        >
                          <Download size={18} />
                          Export CSV
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {reports.map(report => (
                        <div key={report.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:shadow-md transition">
                          <div className="flex items-center gap-4">
                            <FileText size={24} className="text-primary" />
                            <div>
                              <p className="font-semibold text-gray-900">{report.title}</p>
                              <p className="text-sm text-gray-600">{report.description}</p>
                              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                <span className="flex items-center gap-1">
                                  <Clock size={14} />
                                  {report.date}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="grid grid-cols-2 gap-2 text-xs text-right mr-4">
                              {Object.entries(report.metrics).slice(0, 2).map(([key, value]) => (
                                <div key={key}>
                                  <p className="text-gray-600">{key}</p>
                                  <p className="font-bold text-gray-900">{value}</p>
                                </div>
                              ))}
                            </div>
                            <button
                              onClick={() => handleExportPDF(report.id)}
                              disabled={generating}
                              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition flex items-center gap-2"
                            >
                              {generating ? (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              ) : (
                                <Download size={18} />
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recent Activities Table */}
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h3 className="text-xl font-bold text-gray-900 mb-4">Recent Activities (Last {filteredActivities.length})</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-3 px-4 font-semibold text-gray-900">Date</th>
                            <th className="text-left py-3 px-4 font-semibold text-gray-900">Action</th>
                            <th className="text-left py-3 px-4 font-semibold text-gray-900">User</th>
                            <th className="text-left py-3 px-4 font-semibold text-gray-900">Email</th>
                            <th className="text-left py-3 px-4 font-semibold text-gray-900">Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredActivities.slice(0, 10).map((activity, idx) => (
                            <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="py-3 px-4 text-gray-700">{new Date(activity.created_at).toLocaleString()}</td>
                              <td className="py-3 px-4">
                                <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                                  {activity.action_type?.replace(/_/g, ' ')}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-gray-700">{activity.user_name || 'System'}</td>
                              <td className="py-3 px-4 text-gray-700">{activity.user_email || '-'}</td>
                              <td className="py-3 px-4 text-gray-700">{activity.description || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
