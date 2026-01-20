import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001/api';

export const sendNotificationEmail = async ({ user_id, email, subject, message }) => {
  const res = await axios.post(`${API_BASE}/notification-email/send`, {
    user_id, email, subject, message
  });
  return res.data;
};
