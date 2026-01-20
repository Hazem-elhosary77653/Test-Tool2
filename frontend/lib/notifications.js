import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001/api';

export const fetchNotifications = async (userId) => {
  const res = await axios.get(`${API_BASE}/notifications/${userId}`);
  return res.data;
};

export const addNotification = async (user_id, message) => {
  const res = await axios.post(`${API_BASE}/notifications`, { user_id, message });
  return res.data;
};

export const markNotificationRead = async (id) => {
  const res = await axios.post(`${API_BASE}/notifications/read/${id}`);
  return res.data;
};
