/** Keep a tooltip within the visible viewport without changing its anchor. */
export function fitTooltip(container: HTMLElement) {
  const tooltip = container.querySelector<HTMLElement>(".profile-action-tooltip");
  if (!tooltip) return;
  tooltip.style.removeProperty("--tooltip-shift");
  const bounds = tooltip.getBoundingClientRect();
  const viewport = window.visualViewport;
  const left = (viewport?.offsetLeft ?? 0) + 8;
  const right = (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth) - 8;
  const shift = bounds.left < left ? left - bounds.left : bounds.right > right ? right - bounds.right : 0;
  tooltip.style.setProperty("--tooltip-shift", `${shift}px`);
}
