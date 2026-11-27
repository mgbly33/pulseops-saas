import React, { Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useAuthStore, type AuthUser, type WorkspaceSummary } from './store/authStore';
import { useUiStore } from './store/uiStore';
import { apiRequest, ApiError } from './lib/api';
import { toast } from './store/toastStore';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastContainer } from './components/ToastContainer';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';

// Route-level code splitting for lean production chunks
const OverviewPage = React.lazy(() =>
  import('./pages/OverviewPage').then((m) => ({ default: m.OverviewPage })),
);
const ForecastPage = React.lazy(() =>
  import('./pages/ForecastPage').then((m) => ({ default: m.ForecastPage })),
);
const ReportsPage = React.lazy(() =>
  import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })),
);
const PlaybooksPage = React.lazy(() =>
  import('./pages/PlaybooksPage').then((m) => ({ default: m.PlaybooksPage })),
);
const DevelopersPage = React.lazy(() =>
  import('./pages/DevelopersPage').then((m) => ({ default: m.DevelopersPage })),
);
const OrdersPage = React.lazy(() =>
  import('./pages/OrdersPage').then((m) => ({ default: m.OrdersPage })),
);
const CustomersPage = React.lazy(() =>
  import('./pages/CustomersPage').then((m) => ({ default: m.CustomersPage })),
);
const AlertsPage = React.lazy(() =>
  import('./pages/AlertsPage').then((m) => ({ default: m.AlertsPage })),
);
const TeamPage = React.lazy(() =>
  import('./pages/TeamPage').then((m) => ({ default: m.TeamPage })),
);
const NotFoundPage = React.lazy(() =>
  import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
);

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) return;
      toast.error(error.message || 'API request failed');
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
    </div>
  );
}

function ProtectedShell() {
  const { token, setWorkspaces, logout } = useAuthStore();
  const [verifiedToken, setVerifiedToken] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setVerifiedToken(null);
      return;
    }
    let cancelled = false;
    apiRequest<{ user: AuthUser; workspaces: WorkspaceSummary[] }>('/api/auth/me')
      .then((res) => {
        if (cancelled) return;
        if (res.workspaces.length > 0) {
          setWorkspaces(res.workspaces);
        }
        setVerifiedToken(token);
      })
      .catch(() => {
        if (cancelled) return;
        logout();
        setVerifiedToken(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token, setWorkspaces, logout]);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (verifiedToken !== token) {
    return <PageLoader />;
  }

  return <AppShell />;
}

export function App() {
  const theme = useUiStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<ProtectedShell />}>
                <Route path="/" element={<OverviewPage />} />
                <Route path="/forecast" element={<ForecastPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/playbooks" element={<PlaybooksPage />} />
                <Route path="/orders" element={<OrdersPage />} />
                <Route path="/customers" element={<CustomersPage />} />
                <Route path="/alerts" element={<AlertsPage />} />
                <Route path="/developers" element={<DevelopersPage />} />
                <Route path="/team" element={<TeamPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
        <ToastContainer />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
export default App;
