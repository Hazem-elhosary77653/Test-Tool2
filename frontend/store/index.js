import { create } from 'zustand';
import api from '@/lib/api';

export const useAuthStore = create((set) => ({
  user: null,
  token: null,
  setAuth: (user, token) => {
    set({ user, token });
    localStorage.setItem('token', token);
  },
  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      // ignore network errors and continue clearing local state
    }
    set({ user: null, token: null });
    localStorage.removeItem('token');
  },
  loadAuth: () => {
    const token = localStorage.getItem('token');
    if (token) {
      set({ token });
    }
  },
}));

export const useUserStoriesStore = create((set) => ({
  stories: [],
  setStories: (stories) => set({ stories }),
  addStory: (story) => set((state) => ({ stories: [...state.stories, story] })),
  removeStory: (id) => set((state) => ({ stories: state.stories.filter((s) => s.id !== id) })),
}));

export const useBRDStore = create((set) => ({
  brds: [],
  setBRDs: (brds) => set({ brds }),
  addBRD: (brd) => set((state) => ({ brds: [...state.brds, brd] })),
  removeBRD: (id) => set((state) => ({ brds: state.brds.filter((b) => b.id !== id) })),
}));

export const useProjectStore = create((set) => ({
  activeGroupId: '',
  activeGroupName: 'All Projects',
  setActiveProject: (id, name) => set({ activeGroupId: id, activeGroupName: name || 'All Projects' }),
}));
