'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import api from '@/lib/api';
import { useAuthStore } from '@/store';
import TwoFAVerification from '@/components/TwoFAVerification';

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [credential, setCredential] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [show2FA, setShow2FA] = useState(false);
  const [tempUser, setTempUser] = useState(null);
  const [tempToken, setTempToken] = useState(null);
  const [twofaSetup, setTwofaSetup] = useState(null);

  // Forgot Password States
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [lastSentEmail, setLastSentEmail] = useState('');
  const resendTimerRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api.post('/auth/login', { credential, password });

      const { token, user } = response.data;
      if (token && user) {
        setAuth(user, token);
        router.push('/dashboard');
      } else {
        setError('Login failed: missing token or user info');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handle2FAVerified = ({ user, token }) => {
    // 2FA code was verified successfully, complete login with returned token
    setAuth(user, token);
    setShow2FA(false);
    setTempUser(null);
    setTempToken(null);
    setTwofaSetup(null);
    router.push('/dashboard');
  };

  const handle2FACancel = () => {
    setShow2FA(false);
    setTempUser(null);
    setTempToken(null);
    setTwofaSetup(null);
    setPassword('');
  };

  // Handle Forgot Password Submit
  const startResendCooldown = (email) => {
    setLastSentEmail(email);
    setResendCooldown(180); // 3 minutes
    resendTimerRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(resendTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    };
  }, []);

  const handleForgotPassword = async (e, isResend = false) => {
    if (e) e.preventDefault();
    setResetLoading(true);
    setResetError('');
    if (!isResend) setResetMessage('');

    try {
      const response = await api.post('/password-reset/request', { email: resetEmail });
      setResetMessage(response.data.message || 'Password reset link has been sent to your email.');
      if (!isResend) setResetEmail('');
      startResendCooldown(resetEmail);
    } catch (err) {
      setResetError(err.response?.data?.error || 'Failed to send reset email. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  // Close Forgot Password Modal
  const closeForgotPassword = () => {
    setShowForgotPassword(false);
    setResetEmail('');
    setResetMessage('');
    setResetError('');
  };

  // User Icon SVG
  const UserIcon = () => (
    <svg className="w-5 h-5 text-accent" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    </svg>
  );

  // Lock Icon SVG
  const LockIcon = () => (
    <svg className="w-5 h-5 text-accent" fill="currentColor" viewBox="0 0 24 24">
      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
    </svg>
  );

  // Email Icon SVG
  const EmailIcon = () => (
    <svg className="w-5 h-5 text-accent" fill="currentColor" viewBox="0 0 24 24">
      <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
    </svg>
  );

  // Close Icon SVG
  const CloseIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );

  return (
    <>
      <div className="min-h-screen flex items-center justify-center p-4 bg-surface-strong">
        <div className="bg-surface rounded-2xl shadow-card max-w-md w-full p-10 space-y-6">
          {/* Logo */}
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center border-2 border-accent shadow-md">
              <Image src="/bat-logo.png" alt="Logo" width={50} height={50} />
            </div>
          </div>

          {/* Header */}
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-primary tracking-tight">
              Member Login
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Username Field */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <UserIcon />
              </div>
              <input
                type="text"
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 border border-border rounded-full bg-white focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent text-text placeholder:text-muted transition-all"
                placeholder="Username"
                required
              />
            </div>

            {/* Password Field */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <LockIcon />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 border border-border rounded-full bg-white focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent text-text placeholder:text-muted transition-all"
                placeholder="Password"
                required
              />
            </div>

            {/* Remember Me & Forgot Password */}
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer text-text-muted">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-accent focus:ring-accent cursor-pointer"
                />
                <span>Remember me</span>
              </label>
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-text-muted hover:text-accent transition-colors italic"
              >
                Forgot Password?
              </button>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-accent text-white font-semibold rounded-full hover:bg-[#e8900f] focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 transition-all shadow-md disabled:opacity-70 disabled:cursor-not-allowed uppercase tracking-wide"
            >
              {loading ? 'Signing in...' : 'LOGIN'}
            </button>
          </form>
        </div>
      </div>

      {/* 2FA Modal */}
      {show2FA && tempUser && (
        <TwoFAVerification
          userId={tempUser.id}
          userEmail={tempUser.email}
          userName={tempUser.firstName}
          twofaSetup={twofaSetup}
          onVerified={handle2FAVerified}
          onCancel={handle2FACancel}
        />
      )}

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl shadow-card max-w-md w-full p-8 space-y-6 animate-slideIn">
            {/* Modal Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-primary">Reset Password</h2>
              <button
                onClick={closeForgotPassword}
                className="text-text-muted hover:text-primary transition-colors p-1 rounded-full hover:bg-surface-strong"
              >
                <CloseIcon />
              </button>
            </div>

            {/* Description */}
            <p className="text-text-muted text-sm">
              Enter your email address and we'll send you a link to reset your password.
            </p>

            {/* Success Message */}
            {resetMessage && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                </svg>
                {resetMessage}
              </div>
            )}

            {/* Error Message */}
            {resetError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {resetError}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <EmailIcon />
                </div>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => {
                    setResetEmail(e.target.value);
                    // If the email changes and is not the last sent email, reset cooldown
                    if (e.target.value !== lastSentEmail && resendCooldown > 0) {
                      setResendCooldown(0);
                    }
                  }}
                  className="w-full pl-12 pr-4 py-3.5 border border-border rounded-full bg-white focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent text-text placeholder:text-muted transition-all"
                  placeholder="Enter your email"
                  required
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeForgotPassword}
                  className="flex-1 py-3 border border-border text-text-muted font-medium rounded-full hover:bg-surface-strong transition-all"
                >
                  Cancel
                </button>
                {!resetMessage && (
                  <button
                    type="submit"
                    disabled={resetLoading || (resendCooldown > 0 && resetEmail === lastSentEmail)}
                    className="flex-1 py-3 bg-accent text-white font-semibold rounded-full hover:bg-[#e8900f] focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 transition-all shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {resetLoading ? 'Sending...' : 'Send Reset Link'}
                  </button>
                )}
                {resetMessage && (
                  <button
                    type="button"
                    disabled={resendCooldown > 0 && resetEmail === lastSentEmail || resetLoading}
                    onClick={(e) => handleForgotPassword(e, true)}
                    className="flex-1 py-3 bg-accent text-white font-semibold rounded-full hover:bg-[#e8900f] focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 transition-all shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {resendCooldown > 0 && resetEmail === lastSentEmail ? `Send Again (${resendCooldown}s)` : 'Resend Link'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
