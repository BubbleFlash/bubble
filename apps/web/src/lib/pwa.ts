import { useSyncExternalStore } from "react";

/**
 * Installable-app support: registers the service worker, tracks "update available" and the
 * browser's install prompt, and exposes both to React through small stores.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaState {
  updateReady: boolean;
  canInstall: boolean;
  updating: boolean;
}

let state: PwaState = { updateReady: false, canInstall: false, updating: false };
const listeners = new Set<() => void>();
let installEvent: BeforeInstallPromptEvent | null = null;
let waitingWorker: ServiceWorker | null = null;
let updateRequested = false;
let updateReloaded = false;

function reloadForUpdate() {
  if (updateReloaded) return;
  updateReloaded = true;
  window.location.reload();
}

function setState(patch: Partial<PwaState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const usePwa = () => useSyncExternalStore(subscribe, () => state);

/** Tells the waiting service worker to take over; the page reloads once it has. */
export function applyUpdate() {
  if (updateRequested) return;
  updateRequested = true;
  setState({ updating: true });
  // A worker may have activated in another tab since the banner appeared.
  void navigator.serviceWorker.getRegistration().then((registration) => {
    const worker = registration?.waiting ?? (waitingWorker?.state === "installed" ? waitingWorker : null);
    if (!worker) return reloadForUpdate();
    worker.postMessage({ type: "SKIP_WAITING" });
    // Older or failed workers may never claim this page.
    window.setTimeout(reloadForUpdate, 5000);
  }).catch(reloadForUpdate);
}

/** Shows the browser's own install dialog. Only works after the user clicks something. */
export async function promptInstall() {
  if (!installEvent) return;
  await installEvent.prompt();
  await installEvent.userChoice;
  installEvent = null;
  setState({ canInstall: false });
}

function trackWaiting(registration: ServiceWorkerRegistration) {
  // A waiting worker while a controller exists means this is an update, not a first install.
  if (registration.waiting && navigator.serviceWorker.controller) {
    waitingWorker = registration.waiting;
    setState({ updateReady: true });
  }
}

export function registerServiceWorker() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep it for our own button instead of the browser's mini-bar
    installEvent = e as BeforeInstallPromptEvent;
    setState({ canInstall: true });
  });
  window.addEventListener("appinstalled", () => {
    installEvent = null;
    setState({ canInstall: false });
  });

  // Not in development: a cached dev server is a debugging nightmare.
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        trackWaiting(registration);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed") trackWaiting(registration);
          });
        });
        // Long-lived installed apps rarely reload, so look for a new version every hour.
        setInterval(() => void registration.update(), 60 * 60 * 1000);
      })
      .catch(() => undefined);
  });

  // Reload only when the user asked for the update, never on the very first install.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (updateRequested) reloadForUpdate();
  });
}

/** True while the browser reports a network connection. */
export const useOnline = () =>
  useSyncExternalStore(
    (listener) => {
      window.addEventListener("online", listener);
      window.addEventListener("offline", listener);
      return () => {
        window.removeEventListener("online", listener);
        window.removeEventListener("offline", listener);
      };
    },
    () => navigator.onLine,
  );
