import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'ANALYST';

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  currency: 'CNY' | 'USD' | string;
  role: WorkspaceRole;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
  setSession: (token: string, user: AuthUser, workspaces: WorkspaceSummary[]) => void;
  setWorkspaces: (workspaces: WorkspaceSummary[]) => void;
  setActiveWorkspace: (workspaceId: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      workspaces: [],
      activeWorkspaceId: null,
      setSession: (token, user, workspaces) => {
        const current = get().activeWorkspaceId;
        const validCurrent = workspaces.some((w) => w.id === current) ? current : workspaces[0]?.id ?? null;
        set({ token, user, workspaces, activeWorkspaceId: validCurrent });
      },
      setWorkspaces: (workspaces) => {
        const current = get().activeWorkspaceId;
        const validCurrent = workspaces.some((w) => w.id === current) ? current : workspaces[0]?.id ?? null;
        set({ workspaces, activeWorkspaceId: validCurrent });
      },
      setActiveWorkspace: (workspaceId) => set({ activeWorkspaceId: workspaceId }),
      logout: () => set({ token: null, user: null, workspaces: [], activeWorkspaceId: null }),
    }),
    {
      name: 'pulseops-auth-v1',
    },
  ),
);

export function useActiveWorkspace(): WorkspaceSummary | null {
  const { workspaces, activeWorkspaceId } = useAuthStore();
  return workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0] ?? null;
}
