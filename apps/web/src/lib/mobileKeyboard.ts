export function usesMobileKeyboard(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    // iPadOS can identify itself as macOS when requesting desktop sites.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
