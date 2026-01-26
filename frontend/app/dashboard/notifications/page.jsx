'use client';

import { useState, useEffect } from 'react';
import { Bell, Check, BellOff, Clock, Trash2, Filter, CheckCircle2 } from 'lucide-react';
import api from '@/lib/api';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { useAuthStore } from '@/store';

export default function NotificationsPage() {
    const { user } = useAuthStore();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // all, unread

    const fetchNotifications = async () => {
        try {
            setLoading(true);
            const res = await api.get(`/notifications?limit=50${filter === 'unread' ? '&unreadOnly=true' : ''}`);
            if (res.data?.success) {
                setNotifications(res.data.data);
            }
        } catch (err) {
            console.error('Failed to fetch notifications:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) fetchNotifications();
    }, [user, filter]);

    const handleMarkAsRead = async (id) => {
        try {
            await api.post(`/notifications/read/${id}`);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
        } catch (err) {
            console.error('Failed to mark as read:', err);
        }
    };

    const handleMarkAllRead = async () => {
        try {
            await api.post('/notifications/read/all');
            setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
        } catch (err) {
            console.error('Failed to mark all as read:', err);
        }
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="flex h-screen bg-gray-50 text-gray-900">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
                <Header />
                <main className="flex-1 overflow-y-auto p-6">
                    <div className="max-w-4xl mx-auto">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                            <div>
                                <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                                    Notifications
                                </h1>
                                <p className="text-gray-600">Keep track of updates and assignments</p>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleMarkAllRead}
                                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                                >
                                    <CheckCircle2 size={16} className="text-green-600" />
                                    Mark all as read
                                </button>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                            {/* Toolbar */}
                            <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50/50">
                                <div className="flex items-center gap-2">
                                    <Filter size={16} className="text-gray-400" />
                                    <span className="text-sm font-semibold text-gray-700">Filter:</span>
                                    <div className="flex p-1 bg-gray-200/50 rounded-lg ml-2">
                                        <button
                                            onClick={() => setFilter('all')}
                                            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${filter === 'all' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            All
                                        </button>
                                        <button
                                            onClick={() => setFilter('unread')}
                                            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${filter === 'unread' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            Unread
                                        </button>
                                    </div>
                                </div>
                                <div className="text-xs text-gray-500">
                                    Showing {notifications.length} notifications
                                </div>
                            </div>

                            {/* List */}
                            <div className="divide-y divide-gray-100">
                                {loading ? (
                                    <div className="p-12 text-center">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                                        <p className="text-gray-500 mt-4">Loading your notifications...</p>
                                    </div>
                                ) : notifications.length === 0 ? (
                                    <div className="p-20 text-center">
                                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100">
                                            <BellOff size={32} className="text-gray-300" />
                                        </div>
                                        <h3 className="text-lg font-bold text-gray-900">All caught up!</h3>
                                        <p className="text-gray-500 mt-1 max-w-xs mx-auto">
                                            {filter === 'unread' ? "You don't have any unread notifications." : "You don't have any notifications at the moment."}
                                        </p>
                                    </div>
                                ) : (
                                    notifications.map((n) => (
                                        <div
                                            key={n.id}
                                            className={`p-6 hover:bg-gray-50/80 transition-all group relative ${!n.is_read ? 'bg-primary/[0.01]' : ''}`}
                                        >
                                            <div className="flex items-start gap-5">
                                                <div className={`mt-1.5 w-3 h-3 rounded-full flex-shrink-0 border-2 border-white ring-2 ${!n.is_read ? 'bg-primary ring-primary/20 animate-pulse' : 'bg-gray-200 ring-transparent'}`} />
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary/70 bg-primary/5 px-2 py-0.5 rounded">
                                                            {n.type.replace(/_/g, ' ')}
                                                        </span>
                                                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                                                            <Clock size={14} />
                                                            {formatDate(n.created_at)}
                                                        </div>
                                                    </div>
                                                    <p className={`text-base leading-relaxed ${!n.is_read ? 'text-gray-900 font-semibold' : 'text-gray-600'}`}>
                                                        {n.message}
                                                    </p>
                                                    {n.actor_name && (
                                                        <div className="mt-3 flex items-center gap-2">
                                                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-[10px] text-white font-bold">
                                                                {n.actor_name.charAt(0)}
                                                            </div>
                                                            <span className="text-xs text-gray-500 font-medium">By {n.actor_name}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {!n.is_read && (
                                                    <button
                                                        onClick={() => handleMarkAsRead(n.id)}
                                                        className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-all"
                                                        title="Mark as read"
                                                    >
                                                        <Check size={20} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
