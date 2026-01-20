'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import api from '@/lib/api';

export default function ResetPasswordPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get('token');

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [tokenStatus, setTokenStatus] = useState('verifying'); // verifying, valid, invalid
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const [formData, setFormData] = useState({
        newPassword: '',
        confirmPassword: ''
    });

    // Verify token on mount
    useEffect(() => {
        if (!token) {
            setTokenStatus('invalid');
            setError('Invalid or missing reset token.');
            setLoading(false);
            return;
        }

        const verifyToken = async () => {
            try {
                await api.get(`/password-reset/verify/${token}`);
                setTokenStatus('valid');
            } catch (err) {
                setTokenStatus('invalid');
                setError(err.response?.data?.error || 'Invalid or expired reset token.');
            } finally {
                setLoading(false);
            }
        };

        verifyToken();
    }, [token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (formData.newPassword !== formData.confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (formData.newPassword.length < 8) {
            setError('Password must be at least 8 characters long');
            return;
        }

        setSubmitting(true);

        try {
            await api.post('/password-reset/reset', {
                token,
                newPassword: formData.newPassword,
                confirmPassword: formData.confirmPassword
            });
            setSuccess(true);
            setTimeout(() => {
                router.push('/login');
            }, 3000);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to reset password');
        } finally {
            setSubmitting(false);
        }
    };

    // Lock Icon SVG
    const LockIcon = () => (
        <svg className="w-5 h-5 text-accent" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
        </svg>
    );

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-surface-strong">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-surface-strong">
            <div className="bg-surface rounded-2xl shadow-card max-w-md w-full p-10 space-y-6">

                {/* Logo */}
                <div className="flex justify-center">
                    <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center border-2 border-accent shadow-md">
                        <Image src="/bat-logo.png" alt="Logo" width={50} height={50} />
                    </div>
                </div>

                {/* Header */}
                <div className="text-center space-y-2">
                    <h1 className="text-2xl font-semibold text-primary tracking-tight">
                        Reset Password
                    </h1>
                    {!success && tokenStatus === 'valid' && (
                        <p className="text-text-muted text-sm">Enter your new password below.</p>
                    )}
                </div>

                {/* Success State */}
                {success ? (
                    <div className="text-center space-y-6 animate-slideIn">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-lg font-medium text-text">Password Reset Successfully!</h3>
                            <p className="text-text-muted text-sm">You can now login with your new password.</p>
                        </div>
                        <Link
                            href="/login"
                            className="block w-full py-3.5 bg-accent text-white font-semibold rounded-full hover:bg-[#e8900f] transition-all shadow-md text-center"
                        >
                            Go to Login
                        </Link>
                    </div>
                ) : tokenStatus === 'invalid' ? (
                    /* Invalid Token State */
                    <div className="text-center space-y-6 animate-slideIn">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-lg font-medium text-text">Invalid or Expired Link</h3>
                            <p className="text-text-muted text-sm">{error}</p>
                        </div>
                        <Link
                            href="/login"
                            className="block w-full py-3.5 border border-border text-text font-semibold rounded-full hover:bg-surface-strong transition-all text-center"
                        >
                            Back to Login
                        </Link>
                    </div>
                ) : (
                    /* Reset Form */
                    <form onSubmit={handleSubmit} className="space-y-5 animate-slideIn">
                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                                {error}
                            </div>
                        )}

                        <div className="space-y-4">
                            {/* New Password */}
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <LockIcon />
                                </div>
                                <input
                                    type="password"
                                    value={formData.newPassword}
                                    onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                                    className="w-full pl-12 pr-4 py-3.5 border border-border rounded-full bg-white focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent text-text placeholder:text-muted transition-all"
                                    placeholder="New Password"
                                    required
                                    minLength={8}
                                />
                            </div>

                            {/* Confirm Password */}
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <LockIcon />
                                </div>
                                <input
                                    type="password"
                                    value={formData.confirmPassword}
                                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                    className="w-full pl-12 pr-4 py-3.5 border border-border rounded-full bg-white focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent text-text placeholder:text-muted transition-all"
                                    placeholder="Confirm New Password"
                                    required
                                    minLength={8}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full py-3.5 bg-accent text-white font-semibold rounded-full hover:bg-[#e8900f] focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 transition-all shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {submitting ? 'Resetting...' : 'Reset Password'}
                        </button>

                        <div className="text-center">
                            <Link href="/login" className="text-sm text-text-muted hover:text-accent transition-colors">
                                Cancel and return to login
                            </Link>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
