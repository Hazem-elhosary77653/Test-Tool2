'use client';

import { useState, useEffect, useRef } from 'react';
import { Bell, Check, BellOff, ArrowRight, Clock } from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';

export default function NotificationBell() {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [showDropdown, setShowDropdown] = useState(false);
    const [loading, setLoading] = useState(true);
    const dropdownRef = useRef(null);

    const fetchNotifications = async () => {
        try {
            const res = await api.get('/notifications?limit=5');
            if (res.data?.success) {
                setNotifications(res.data.data);
                const unread = res.data.data.filter(n => !n.is_read).length;
                setUnreadCount(unread);
            }
        } catch (err) {
            console.error('Failed to fetch notifications:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();
        // Refresh every minute
        const interval = setInterval(fetchNotifications, 60000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowDropdown(false);
            }
        };
        if (showDropdown) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showDropdown]);

    const handleMarkAsRead = async (id, e) => {
        e.stopPropagation();
        try {
            await api.post(`/notifications/read/${id}`);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (err) {
            console.error('Failed to mark as read:', err);
        }
    };

    const getTimeAgo = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);

        if (diffInSeconds < 60) return 'Just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        return date.toLocaleDateString();
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
                aria-label="Notifications"
            >
                <Bell size={20} />
                {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full animate-pulse">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {showDropdown && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b flex items-center justify-between bg-gray-50/50">
                        <h3 className="font-bold text-gray-900 text-sm">Notifications</h3>
                        {unreadCount > 0 && (
                            <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">
                                {unreadCount} New
                            </span>
                        )}
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                        {loading ? (
                            <div className="p-8 text-center">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">
                                <BellOff size={24} className="mx-auto mb-2 opacity-20" />
                                <p className="text-sm">No new notifications</p>
                            </div>
                        ) : (
                            notifications.map((n) => (
                                <div
                                    key={n.id}
                                    className={`px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors cursor-pointer group ${!n.is_read ? 'bg-primary/[0.02]' : ''}`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${!n.is_read ? 'bg-primary' : 'bg-transparent'}`} />
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm leading-snug ${!n.is_read ? 'text-gray-900 font-semibold' : 'text-gray-600'}`}>
                                                {n.message}
                                            </p>
                                            <div className="flex items-center gap-2 mt-1.5 text-[10px] text-gray-400">
                                                <Clock size={10} />
                                                {getTimeAgo(n.created_at)}
                                                {n.actor_name && (
                                                    <>
                                                        <span className="w-1 h-1 bg-gray-300 rounded-full" />
                                                        <span>By {n.actor_name}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        {!n.is_read && (
                                            <button
                                                onClick={(e) => handleMarkAsRead(n.id, e)}
                                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white rounded border border-gray-200 text-gray-400 hover:text-primary transition-all"
                                                title="Mark as read"
                                            >
                                                <Check size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <Link
                        href="/dashboard/notifications"
                        onClick={() => setShowDropdown(false)}
                        className="block text-center py-2.5 bg-gray-50 text-xs font-semibold text-primary hover:bg-gray-100 transition-colors border-t border-gray-100 flex items-center justify-center gap-1.5"
                    >
                        See all notifications
                        <ArrowRight size={12} />
                    </Link>
                </div>
            )}
        </div>
    );
}
