import { create } from 'zustand'

interface AppState {
  initialized: boolean
  sidebarOpen: boolean
  theme: 'dark' | 'light'
  setInitialized: (value: boolean) => void
  toggleSidebar: () => void
  setTheme: (theme: 'dark' | 'light') => void
}

export const useAppStore = create<AppState>((set) => ({
  initialized: false,
  sidebarOpen: true,
  theme: 'dark',
  setInitialized: (value) => set({ initialized: value }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setTheme: (theme) => set({ theme }),
}))
