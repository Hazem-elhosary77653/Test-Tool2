'use client';

import { useState } from 'react';
import { Shield, Copy, Check } from 'lucide-react';
import api from '@/lib/api';

export default function TwoFAVerification({ userId, userEmail, userName, onVerified, onCancel, twofaSetup }) {
    // إذا تم إرسال qrCodeDataURL وsecret من backend، اعرضهم للمستخدم
    // twofaSetup: { qrCodeDataURL, secret }
  const [verificationMethod, setVerificationMethod] = useState('code'); // 'code' or 'backup'
  const [code, setCode] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!code.trim()) {
      setError('Please enter the verification code');
      return;
    }

    try {
      setLoading(true);
      // إذا كان هناك twofaSetup.secret (أول تفعيل)، أرسل secret مع الطلب
      const payload = {
        userId,
        code: code.replace(/\s/g, '')
      };
      if (twofaSetup && twofaSetup.secret) {
        payload.secret = twofaSetup.secret;
      }
      const response = await api.post('/2fa-verify/verify-code', payload);

      if (response.data.success) {
        setSuccess('Code verified! Logging you in...');
        const { token, user } = response.data;
        setTimeout(() => {
          onVerified({ user, token });
        }, 500);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyBackupCode = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!backupCode.trim()) {
      setError('Please enter the backup code');
      return;
    }

    try {
      setLoading(true);
      const response = await api.post('/2fa-verify/verify-backup-code', {
        userId,
        backupCode: backupCode.replace(/\s/g, '')
      });

      if (response.data.success) {
        setSuccess('Backup code verified! Logging you in...');
        const { token, user } = response.data;
        setTimeout(() => {
          onVerified({ user, token });
        }, 500);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid backup code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary to-purple-600 text-white p-6 rounded-t-lg">
          <div className="flex items-center gap-3">
            <Shield size={28} />
            <div>
              <h2 className="text-2xl font-bold">Two-Factor Authentication</h2>
              <p className="text-sm text-purple-100">{userEmail}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Method Tabs */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => {
                setVerificationMethod('code');
                setError('');
                setSuccess('');
              }}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
                verificationMethod === 'code'
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Authenticator
            </button>
            <button
              onClick={() => {
                setVerificationMethod('backup');
                setError('');
                setSuccess('');
              }}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
                verificationMethod === 'backup'
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Backup Code
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded-lg text-sm flex items-center gap-2">
              <Check size={18} />
              {success}
            </div>
          )}

          {/* QR code setup (أول مرة فقط) */}
          {twofaSetup && verificationMethod === 'code' && (
            <div className="mb-6 text-center">
              <p className="mb-2 text-sm text-gray-700">Scan this QR code with your Authenticator app:</p>
              <img src={twofaSetup.qrCodeDataURL} alt="2FA QR Code" className="mx-auto mb-2 w-40 h-40 border rounded-lg" />
              <p className="text-xs text-gray-500">Or enter this code manually:</p>
              <div className="font-mono text-base bg-gray-100 rounded px-2 py-1 inline-block mb-2 select-all">{twofaSetup.secret}</div>
              <p className="text-xs text-gray-400 mb-2">After scanning, enter the 6-digit code below to complete setup.</p>
            </div>
          )}
          {/* Authenticator Code Form */}
          {verificationMethod === 'code' && (
            <form onSubmit={handleVerifyCode}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enter 6-digit code from your authenticator app
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.slice(0, 6))}
                  placeholder="000000"
                  maxLength="6"
                  inputMode="numeric"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-primary text-center text-2xl tracking-widest font-mono"
                  disabled={loading}
                />
              </div>
              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full bg-primary text-white py-2 rounded-lg font-medium hover:bg-primary-dark transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Verifying...' : 'Verify Code'}
              </button>
            </form>
          )}

          {/* Backup Code Form */}
          {verificationMethod === 'backup' && (
            <form onSubmit={handleVerifyBackupCode}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enter one of your backup codes
                </label>
                <input
                  type="text"
                  value={backupCode}
                  onChange={(e) => setBackupCode(e.target.value)}
                  placeholder="XXXX-XXXX-XXXX"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={loading}
                />
              </div>
              <p className="text-xs text-gray-500 mb-4">
                Backup codes are 12 characters long and separated by hyphens.
              </p>
              <button
                type="submit"
                disabled={loading || !backupCode.trim()}
                className="w-full bg-primary text-white py-2 rounded-lg font-medium hover:bg-primary-dark transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Verifying...' : 'Verify Code'}
              </button>
            </form>
          )}

          {/* Cancel Button */}
          <button
            onClick={onCancel}
            className="w-full mt-4 py-2 text-gray-600 hover:text-gray-800 font-medium transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
