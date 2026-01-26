'use client';

import { useState, useEffect } from 'react';
import { Settings, Edit3, Save, X, Megaphone, CheckCircle2, AlertCircle, Mail, AppWindow, Send } from 'lucide-react';
import api from '@/lib/api';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { useAuthStore } from '@/store';
import { useRouter } from 'next/navigation';

export default function AdminNotificationsPage() {
    const { user } = useAuthStore();
    const router = useRouter();
    const [settings, setSettings] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [announcement, setAnnouncement] = useState({
        subject: '',
        message: '',
        target_type: 'all', // all, role, user
        target_value: '',
        channels: ['app'] // app, email
    });
    const [targets, setTargets] = useState({ users: [], roles: [] });
    const [statusMessage, setStatusMessage] = useState(null);

    useEffect(() => {
        if (user && user.role !== 'admin') {
            router.push('/dashboard');
            return;
        }
        fetchData();
    }, [user]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [settingsRes, templatesRes, targetsRes] = await Promise.all([
                api.get('/notifications/admin/settings'),
                api.get('/notifications/admin/templates'),
                api.get('/notifications/admin/targets')
            ]);
            setSettings(settingsRes.data.data);
            setTemplates(templatesRes.data.data);
            setTargets(targetsRes.data.data);
        } catch (err) {
            console.error('Failed to fetch admin data:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleSetting = async (setting, field) => {
        try {
            const updated = { ...setting, [field]: !setting[field] };
            await api.put('/notifications/admin/settings', updated);
            setSettings(prev => prev.map(s => s.type === setting.type ? updated : s));
            showStatus('Setting updated successfully', 'success');
        } catch (err) {
            showStatus('Failed to update setting', 'error');
        }
    };

    const handleUpdateTemplate = async () => {
        try {
            await api.put('/notifications/admin/templates', editingTemplate);
            setTemplates(prev => prev.map(t => t.type === editingTemplate.type ? editingTemplate : t));
            setEditingTemplate(null);
            showStatus('Template updated successfully', 'success');
        } catch (err) {
            showStatus('Failed to update template', 'error');
        }
    };

    const handleSendAnnouncement = async (e) => {
        e.preventDefault();
        try {
            if (announcement.target_type !== 'all' && !announcement.target_value) {
                showStatus('Please select a target', 'error');
                return;
            }
            await api.post('/notifications/admin/send-bulk', announcement);
            setAnnouncement({ ...announcement, subject: '', message: '' });
            showStatus('Notification sent successfully', 'success');
        } catch (err) {
            showStatus('Failed to send notification', 'error');
        }
    };

    const toggleChannel = (channel) => {
        setAnnouncement(prev => ({
            ...prev,
            channels: prev.channels.includes(channel)
                ? prev.channels.filter(c => c !== channel)
                : [...prev.channels, channel]
        }));
    };

    const showStatus = (msg, type) => {
        setStatusMessage({ msg, type });
        setTimeout(() => setStatusMessage(null), 3000);
    };

    if (loading) return (
        <div className="flex h-screen bg-[#fafbfc]">
            <Sidebar />
            <div className="flex-1 flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                <p className="text-gray-600 mt-4 font-medium">Loading administrative controls...</p>
            </div>
        </div>
    );

    return (
        <div className="flex h-screen bg-[#fafbfc] text-gray-900">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
                <Header />
                <main className="flex-1 overflow-y-auto p-6 lg:p-8">
                    <div className="max-w-7xl mx-auto">

                        {/* Page Header */}
                        <div className="mb-8">
                            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent mb-2">
                                Notifications Setup
                            </h1>
                            <p className="text-gray-600">Configure delivery channels, customize templates, and broadcast announcements.</p>
                        </div>

                        {statusMessage && (
                            <div className={`mb-8 p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 shadow-sm border ${statusMessage.type === 'success' ? 'bg-emerald-50 text-emerald-900 border-emerald-100' : 'bg-rose-50 text-rose-900 border-rose-100'}`}>
                                <div className={`${statusMessage.type === 'success' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                    {statusMessage.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                                </div>
                                <p className="font-semibold text-sm">{statusMessage.msg}</p>
                            </div>
                        )}

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                            {/* Left Side: Settings & Templates */}
                            <div className="lg:col-span-2 space-y-8">

                                {/* Delivery Infrastructure */}
                                <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                    <div className="px-6 py-5 bg-gray-50/50 border-b border-gray-200 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-primary/10 rounded-lg text-primary">
                                                <Settings size={20} />
                                            </div>
                                            <h2 className="text-lg font-bold text-gray-900">Delivery Channels</h2>
                                        </div>
                                    </div>
                                    <div className="divide-y divide-gray-100">
                                        {settings.map((s) => (
                                            <div key={s.type} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                                                <div>
                                                    <p className="font-semibold text-gray-900 capitalize">{s.type.replace(/_/g, ' ')}</p>
                                                    <p className="text-xs text-gray-500">System generated alert</p>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <div className="flex flex-col items-center gap-1">
                                                        <button
                                                            onClick={() => handleToggleSetting(s, 'is_enabled_in_app')}
                                                            className={`p-2.5 rounded-lg transition-all ${s.is_enabled_in_app ? 'bg-primary text-white shadow-md' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                                                            title="Toggle App Notification"
                                                        >
                                                            <AppWindow size={18} />
                                                        </button>
                                                        <span className="text-[10px] font-bold text-gray-400 uppercase">App</span>
                                                    </div>
                                                    <div className="flex flex-col items-center gap-1">
                                                        <button
                                                            onClick={() => handleToggleSetting(s, 'is_enabled_email')}
                                                            className={`p-2.5 rounded-lg transition-all ${s.is_enabled_email ? 'bg-orange-500 text-white shadow-md' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                                                            title="Toggle Email Notification"
                                                        >
                                                            <Mail size={18} />
                                                        </button>
                                                        <span className="text-[10px] font-bold text-gray-400 uppercase">Email</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>

                                {/* Content Blueprints */}
                                <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                    <div className="px-6 py-5 bg-gray-50/50 border-b border-gray-200">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
                                                <Edit3 size={20} />
                                            </div>
                                            <h2 className="text-lg font-bold text-gray-900">Notification Templates</h2>
                                        </div>
                                    </div>
                                    <div className="divide-y divide-gray-100">
                                        {templates.map((t) => (
                                            <div key={t.type} className="px-6 py-6 group">
                                                {editingTemplate?.type === t.type ? (
                                                    <div className="space-y-4 animate-in fade-in duration-300">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <p className="text-xs font-bold text-primary uppercase tracking-wider">Editing: {t.type.replace(/_/g, ' ')}</p>
                                                            <button onClick={() => setEditingTemplate(null)} className="text-gray-400 hover:text-gray-600">
                                                                <X size={18} />
                                                            </button>
                                                        </div>
                                                        <div className="space-y-4">
                                                            <div>
                                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5 ml-1">Subject Formula</label>
                                                                <input
                                                                    type="text"
                                                                    value={editingTemplate.subject_template || ''}
                                                                    onChange={(e) => setEditingTemplate({ ...editingTemplate, subject_template: e.target.value })}
                                                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5 ml-1">Message Logic</label>
                                                                <textarea
                                                                    value={editingTemplate.message_template}
                                                                    onChange={(e) => setEditingTemplate({ ...editingTemplate, message_template: e.target.value })}
                                                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none min-h-[100px]"
                                                                />
                                                                <div className="mt-2 flex flex-wrap gap-1.5">
                                                                    {['brd_title', 'actor_name', 'announcement_text'].map(v => (
                                                                        <code key={v} className="text-[10px] font-bold text-primary bg-primary/5 px-2 py-0.5 rounded border border-primary/10 tracking-tight">{`{{${v}}}`}</code>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-2 pt-2">
                                                            <button
                                                                onClick={handleUpdateTemplate}
                                                                className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90 transition-all shadow-sm"
                                                            >
                                                                <Save size={16} /> Save Blueprint
                                                            </button>
                                                            <button
                                                                onClick={() => setEditingTemplate(null)}
                                                                className="px-5 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-200 transition-all"
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex-1 pr-8">
                                                            <h3 className="text-sm font-bold text-gray-900 capitalize mb-1 flex items-center gap-2">
                                                                {t.type.replace(/_/g, ' ')}
                                                                <span className="w-1.5 h-1.5 bg-primary/30 rounded-full group-hover:bg-primary transition-colors"></span>
                                                            </h3>
                                                            <p className="text-gray-600 text-sm italic">"{t.message_template}"</p>
                                                        </div>
                                                        <button
                                                            onClick={() => setEditingTemplate(t)}
                                                            className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all"
                                                        >
                                                            <Edit3 size={18} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            </div>

                            {/* Right Side: Broadcast */}
                            <div className="lg:col-span-1">
                                <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden sticky top-8">
                                    <div className="px-6 py-5 bg-gray-900 text-white flex items-center gap-3">
                                        <Megaphone size={20} />
                                        <h2 className="text-lg font-bold">Custom Broadcast</h2>
                                    </div>
                                    <div className="p-6">
                                        <form onSubmit={handleSendAnnouncement} className="space-y-6">
                                            {/* Targeting */}
                                            <div className="space-y-3">
                                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Target Audience</label>
                                                <div className="grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-lg">
                                                    {['all', 'role', 'user'].map((t) => (
                                                        <button
                                                            key={t}
                                                            type="button"
                                                            onClick={() => setAnnouncement({ ...announcement, target_type: t, target_value: t === 'all' ? 'all' : '' })}
                                                            className={`py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${announcement.target_type === t ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                                        >
                                                            {t}
                                                        </button>
                                                    ))}
                                                </div>

                                                {announcement.target_type === 'role' && (
                                                    <select
                                                        required
                                                        value={announcement.target_value}
                                                        onChange={(e) => setAnnouncement({ ...announcement, target_value: e.target.value })}
                                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                                                    >
                                                        <option value="">Select Target Role</option>
                                                        {targets.roles.map(r => <option key={r} value={r} className="uppercase">{r}</option>)}
                                                    </select>
                                                )}

                                                {announcement.target_type === 'user' && (
                                                    <select
                                                        required
                                                        value={announcement.target_value}
                                                        onChange={(e) => setAnnouncement({ ...announcement, target_value: e.target.value })}
                                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                                                    >
                                                        <option value="">Select Individual User</option>
                                                        {targets.users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                                                    </select>
                                                )}
                                            </div>

                                            {/* Details */}
                                            <div className="space-y-3">
                                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Message Details</label>
                                                <input
                                                    type="text"
                                                    required
                                                    placeholder="Subject Line"
                                                    value={announcement.subject}
                                                    onChange={(e) => setAnnouncement({ ...announcement, subject: e.target.value })}
                                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                                                />
                                                <textarea
                                                    required
                                                    placeholder="Broadcast message..."
                                                    value={announcement.message}
                                                    onChange={(e) => setAnnouncement({ ...announcement, message: e.target.value })}
                                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none min-h-[120px]"
                                                />
                                            </div>

                                            {/* Channels */}
                                            <div className="space-y-3">
                                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Delivery Channels</label>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleChannel('app')}
                                                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border transition-all ${announcement.channels.includes('app') ? 'bg-primary border-primary text-white shadow-sm' : 'bg-transparent border-gray-200 text-gray-400'}`}
                                                    >
                                                        <AppWindow size={16} />
                                                        <span className="text-[10px] font-bold uppercase">App</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleChannel('email')}
                                                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border transition-all ${announcement.channels.includes('email') ? 'bg-orange-500 border-orange-500 text-white shadow-sm' : 'bg-transparent border-gray-200 text-gray-400'}`}
                                                    >
                                                        <Mail size={16} />
                                                        <span className="text-[10px] font-bold uppercase">Email</span>
                                                    </button>
                                                </div>
                                            </div>

                                            <button
                                                type="submit"
                                                className="w-full py-3 bg-primary text-white rounded-lg text-sm font-bold uppercase tracking-widest hover:bg-primary/90 transition-all shadow-md flex items-center justify-center gap-2"
                                            >
                                                <Send size={16} /> Send Broadcast
                                            </button>
                                        </form>

                                        <div className="mt-8 p-4 bg-amber-50 rounded-xl border border-amber-100 flex gap-3">
                                            <AlertCircle size={18} className="text-amber-600 shrink-0" />
                                            <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
                                                Broadcasts bypass user preferences. Use only for critical system-wide announcements.
                                            </p>
                                        </div>
                                    </div>
                                </section>
                            </div>

                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
