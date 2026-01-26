import { useState } from 'react';
import { sendNotificationEmail } from '@/lib/notificationEmail';

export default function SendNotificationForm() {
  const [form, setForm] = useState({ user_id: '', email: '', subject: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await sendNotificationEmail(form);
      setSuccess('تم إرسال الإشعار بنجاح');
      setForm({ user_id: '', email: '', subject: '', message: '' });
    } catch (err) {
      setError(err.response?.data?.error || 'حدث خطأ أثناء الإرسال');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 400, margin: '2rem auto', padding: 16, border: '1px solid #eee', borderRadius: 8 }}>
      <h2>إرسال إشعار عبر الإيميل</h2>
      <div style={{ marginBottom: 8 }}>
        <input name="user_id" value={form.user_id} onChange={handleChange} placeholder="User ID" required style={{ width: '100%' }} />
      </div>
      <div style={{ marginBottom: 8 }}>
        <input name="email" value={form.email} onChange={handleChange} placeholder="البريد الإلكتروني" required style={{ width: '100%' }} />
      </div>
      <div style={{ marginBottom: 8 }}>
        <input name="subject" value={form.subject} onChange={handleChange} placeholder="الموضوع" required style={{ width: '100%' }} />
      </div>
      <div style={{ marginBottom: 8 }}>
        <textarea name="message" value={form.message} onChange={handleChange} placeholder="نص الإشعار" required style={{ width: '100%' }} />
      </div>
      <button type="submit" disabled={loading} style={{ width: '100%' }}>
        {loading ? 'جاري الإرسال...' : 'إرسال الإشعار'}
      </button>
      {success && <div style={{ color: 'green', marginTop: 8 }}>{success}</div>}
      {error && <div style={{ color: 'red', marginTop: 8 }}>{error}</div>}
    </form>
  );
}
