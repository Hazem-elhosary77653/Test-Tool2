'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store';
import api from '@/lib/api';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

const defaultForm = {
  api_key: '',
  model: 'gpt-3.5-turbo',
  temperature: 0.7,
  max_tokens: 2000,
  language: 'en',
  detail_level: 'standard',
};

export default function AiConfigPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState(null);
  const [apiConfigured, setApiConfigured] = useState(false);


  // تم حذف خاصية الكريدت بناءً على سياسة OpenAI الجديدة


  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    loadConfig();
    // لا داعي لجلب الكريدت بعد الآن
  }, [user, router]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const res = await api.get('/ai-config');
      const cfg = res.data?.data || {};
      setForm((prev) => ({
        ...prev,
        model: cfg.model || prev.model,
        temperature: cfg.temperature ?? prev.temperature,
        max_tokens: cfg.max_tokens || prev.max_tokens,
        language: cfg.language || prev.language,
        detail_level: cfg.detail_level || prev.detail_level,
        api_key: '',
      }));
      setApiConfigured(!!cfg.api_key_configured);
      setStatus(null);
    } catch (err) {
      setStatus({ type: 'error', message: 'Failed to load configuration' });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const payload = { ...form };
      if (!payload.api_key) {
        delete payload.api_key; // keep existing if not provided
      }
      await api.put('/ai-config', payload);
      setStatus({ type: 'success', message: 'Configuration saved' });
      setApiConfigured(apiConfigured || !!payload.api_key);
      if (payload.api_key) {
        setForm((prev) => ({ ...prev, api_key: '' }));
      }
    } catch (err) {
      const errData = err.response?.data?.error;
      const msg = typeof errData === 'object' ? errData.message : (errData || err.message || 'Save failed');
      setStatus({ type: 'error', message: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!form.api_key) {
      setStatus({ type: 'error', message: 'Enter an API key to test' });
      return;
    }
    setTesting(true);
    setStatus(null);
    try {
      const res = await api.post('/ai-config/test', { api_key: form.api_key });
      if (res.data?.success) {
        setStatus({ type: 'success', message: 'Connection successful' });
      } else {
        setStatus({ type: 'error', message: 'Connection failed' });
      }
    } catch (err) {
      const errData = err.response?.data?.error;
      const msg = typeof errData === 'object' ? errData.message : (errData || err.message || 'Connection failed');
      setStatus({ type: 'error', message: msg });
    } finally {
      setTesting(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await api.post('/ai-config/reset');
      setForm(defaultForm);
      setApiConfigured(false);
      setStatus({ type: 'success', message: 'Configuration reset to defaults' });
    } catch (err) {
      setStatus({ type: 'error', message: 'Reset failed' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen bg-light">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">AI Configuration</h1>
                <p className="text-sm text-gray-500">Manage your OpenAI settings and test connectivity.</p>
                {/* تم حذف زر الكريدت وعرض الرصيد */}
              </div>
              <div className="text-sm text-gray-600">API key: {apiConfigured ? 'Configured' : 'Not configured'}</div>
            </div>

            {status && (
              <div className={`p-3 rounded-lg border text-sm ${status.type === 'error' ? 'border-red-300 bg-red-50 text-red-700' : 'border-green-300 bg-green-50 text-green-700'}`}>
                {status.message}
              </div>
            )}

            <div className="card p-6 space-y-6">
              {loading ? (
                <p className="text-gray-600">Loading configuration...</p>
              ) : (
                <form className="space-y-4" onSubmit={handleSave}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="label">API Key</label>
                      <input
                        type="password"
                        value={form.api_key}
                        onChange={(e) => handleChange('api_key', e.target.value)}
                        placeholder={apiConfigured ? '••••••••••••••' : 'sk-...'}
                        className="input"
                      />
                      <p className="text-xs text-gray-500 mt-1">Stored encrypted. Leave blank to keep existing.</p>
                    </div>
                    <div>
                      <label className="label">Model</label>
                      <select
                        value={form.model}
                        onChange={(e) => handleChange('model', e.target.value)}
                        className="input"
                      >
                        <option value="gpt-4">GPT-4</option>
                        <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                        <option value="gpt-3.5-turbo-16k">GPT-3.5 Turbo 16K</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="label">Temperature</label>
                      <input
                        type="number"
                        min="0"
                        max="2"
                        step="0.1"
                        value={form.temperature}
                        onChange={(e) => handleChange('temperature', parseFloat(e.target.value) || 0)}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">Max Tokens</label>
                      <input
                        type="number"
                        min="100"
                        max="4000"
                        step="50"
                        value={form.max_tokens}
                        onChange={(e) => handleChange('max_tokens', parseInt(e.target.value, 10) || 0)}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">Detail Level</label>
                      <select
                        value={form.detail_level}
                        onChange={(e) => handleChange('detail_level', e.target.value)}
                        className="input"
                      >
                        <option value="brief">Brief</option>
                        <option value="standard">Standard</option>
                        <option value="detailed">Detailed</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Language</label>
                      <select
                        value={form.language}
                        onChange={(e) => handleChange('language', e.target.value)}
                        className="input"
                      >
                        <option value="en">English</option>
                        <option value="es">Spanish</option>
                        <option value="fr">French</option>
                        <option value="de">German</option>
                        <option value="ar">Arabic</option>
                        <option value="zh">Chinese</option>
                      </select>
                    </div>
                    <div className="flex items-end gap-3">
                      <button
                        type="button"
                        onClick={handleTest}
                        className="btn btn-secondary"
                        disabled={testing}
                      >
                        {testing ? 'Testing...' : 'Test Connection'}
                      </button>
                      <button
                        type="button"
                        onClick={handleReset}
                        className="btn btn-light"
                        disabled={saving}
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3">
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={saving}
                    >
                      {saving ? 'Saving...' : 'Save Configuration'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
