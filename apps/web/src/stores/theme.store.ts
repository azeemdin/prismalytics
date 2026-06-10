import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ThemeMode = 'dark' | 'light';

export const DEFAULT_ACCENT = '#6366f1';

interface ThemeState {
  mode: ThemeMode;
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
  // Runtime accent color loaded from tenant branding (not persisted fetched on each load)
  accentColor: string;
  setAccentColor: (color: string | null | undefined) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'dark',
      toggle: () => set((s) => ({ mode: s.mode === 'dark' ? 'light' : 'dark' })),
      setMode: (mode) => set({ mode }),
      accentColor: DEFAULT_ACCENT,
      setAccentColor: (color) => set({ accentColor: color?.trim() || DEFAULT_ACCENT }),
    }),
    {
      name: 'prismalytics-theme',
      // Only persist the mode preference; accent color comes from the server each load
      partialize: (s) => ({ mode: s.mode }),
    },
  ),
);
