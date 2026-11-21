import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { AuthProvider } from "./store/auth";
import { RealtimeProvider } from "./store/realtime";
import { MusicPlayerProvider } from "./store/music";
import ErrorBoundary, { RouteErrorBoundary } from "./components/ErrorBoundary";
import { ApiError, SessionRestoreError } from "./lib/api";
import { installErrorReporting } from "./lib/report";
import { registerServiceWorker } from "./lib/pwa";
import { armSoundUnlock } from "./lib/sound";
import "@fontsource-variable/bricolage-grotesque";
import "./styles/global.css";
import "./styles/theme.css";
import "./styles/skeleton.css";
import "./styles/aero-tokens.css";
import "./styles/aero-themes.css";
import "./styles/aero-components.css";
import "./styles/aero-shell.css";
import "./styles/aero-home.css";
import "./styles/notifications.css";

armSoundUnlock();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, gcTime: 15 * 60_000, refetchOnWindowFocus: false,
      retry: (count, error) => count < 1
        && !(error instanceof ApiError && error.status >= 400 && error.status < 500)
        && !(error instanceof SessionRestoreError && error.retryAt),
    },
  },
});

const router = createBrowserRouter([
  {
    path: "*",
    errorElement: <RouteErrorBoundary />,
    element: (
      <AuthProvider>
        <MusicPlayerProvider>
          <RealtimeProvider>
            <App />
          </RealtimeProvider>
        </MusicPlayerProvider>
      </AuthProvider>
    ),
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);

installErrorReporting();

registerServiceWorker();
