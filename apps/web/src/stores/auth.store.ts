import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api, { tokenStore } from '../services/api';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<string | null>;
  refreshUser: () => Promise<void>;
  exchangeKeycloak: (code: string, state: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const { data } = await api.post('/auth/login', { email, password });
          const payload = data.data ?? data;
          tokenStore.setTokens(payload.accessToken, payload.refreshToken);
          set({ user: payload.user, isAuthenticated: true });
        } finally {
          set({ isLoading: false });
        }
      },

      register: async (name, email, password) => {
        set({ isLoading: true });
        try {
          const { data } = await api.post('/auth/register', { name, email, password });
          const payload = data.data ?? data;
          tokenStore.setTokens(payload.accessToken, payload.refreshToken);
          set({ user: payload.user, isAuthenticated: true });
        } finally {
          set({ isLoading: false });
        }
      },

      logout: async () => {
        let keycloakLogoutUrl: string | null = null;
        try {
          // Fetch Keycloak logout URL before clearing the session (needs valid token)
          const currentUser = (useAuthStore.getState()).user;
          if (currentUser?.provider === 'keycloak') {
            const redirectUri = `${window.location.origin}/login`;
            const { data } = await api.get(
              `/auth/keycloak/logout-url?post_logout_redirect_uri=${encodeURIComponent(redirectUri)}`,
            );
            const payload = data.data ?? data;
            keycloakLogoutUrl = payload.url ?? null;
          }
        } catch {
          // Non-fatal still clear local state
        }
        try {
          await api.post('/auth/logout');
        } catch {
          // Always clear local state
        }
        tokenStore.clear();
        set({ user: null, isAuthenticated: false });
        return keycloakLogoutUrl;
      },

      refreshUser: async () => {
        try {
          const { data } = await api.get('/auth/me');
          const user = data.data ?? data;
          set({ user, isAuthenticated: true });
        } catch {
          set({ user: null, isAuthenticated: false });
        }
      },

      exchangeKeycloak: async (code, state) => {
        set({ isLoading: true });
        try {
          const { data } = await api.post('/auth/keycloak/exchange', { code, state });
          const payload = data.data ?? data;
          tokenStore.setTokens(payload.accessToken, payload.refreshToken);
          set({ user: payload.user, isAuthenticated: true });
        } finally {
          set({ isLoading: false });
        }
      },
    }),
    {
      name: 'prismalytics-auth',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    },
  ),
);
