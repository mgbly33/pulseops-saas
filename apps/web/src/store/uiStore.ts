import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18n from '../i18n';

interface UiState {
  theme: 'light' | 'dark';
  lang: 'zh' | 'en';
  sidebarCollapsed: boolean;
  commandOpen: boolean;
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleLang: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setCommandOpen: (open: boolean) => void;
}

function applyThemeClass(theme: 'light' | 'dark') {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      lang: (typeof window !== 'undefined' && localStorage.getItem('pulseops_lang') === 'en' ? 'en' : 'zh'),
      sidebarCollapsed: false,
      commandOpen: false,
      toggleTheme: () => {
        const next = get().theme === 'light' ? 'dark' : 'light';
        applyThemeClass(next);
        set({ theme: next });
      },
      setTheme: (theme) => {
        applyThemeClass(theme);
        set({ theme });
      },
      toggleLang: () => {
        const next = get().lang === 'zh' ? 'en' : 'zh';
        i18n.changeLanguage(next);
        localStorage.setItem('pulseops_lang', next);
        set({ lang: next });
      },
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setCommandOpen: (open) => set({ commandOpen: open }),
    }),
    {
      name: 'pulseops-ui-v1',
      partialize: (state) => ({
        theme: state.theme,
        lang: state.lang,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyThemeClass(state.theme);
          i18n.changeLanguage(state.lang);
        }
      },
    },
  ),
);
