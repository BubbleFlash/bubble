import { useEffect } from "react";

/** Show the opaque tab backing only while a sticky tab bar is against its top boundary. */
export function useStickyTabs() {
  useEffect(() => {
    const home = document.querySelector(".aero-home");
    if (!home) return;
    const tracked = ".feed-tabs, .aero-window-chrome";
    let tabBars = home.querySelectorAll<HTMLElement>(".feed-tabs");
    let frame = 0;
    const update = () => {
      frame = 0;
      tabBars.forEach((tabs) => {
        const style = getComputedStyle(tabs);
        let scrolled = window.scrollY > 0;
        for (let parent = tabs.parentElement; parent && !scrolled; parent = parent.parentElement) {
          scrolled = parent.scrollTop > 0;
        }
        const top = Number.parseFloat(style.top);
        const stuck = style.position === "sticky" && scrolled && Number.isFinite(top)
          && tabs.getBoundingClientRect().top <= top + 0.5;
        if (stuck === (tabs.dataset.stuck === "true")) return;
        if (stuck) tabs.dataset.stuck = "true";
        else delete tabs.dataset.stuck;
      });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const sizes = new ResizeObserver(schedule);
    const refresh = () => {
      tabBars = home.querySelectorAll<HTMLElement>(".feed-tabs");
      sizes.disconnect();
      const chrome = home.querySelector(".aero-window-chrome");
      if (chrome) sizes.observe(chrome);
      tabBars.forEach(tabs => sizes.observe(tabs));
      schedule();
    };
    const containsTracked = (node: Node) =>
      node instanceof Element && (node.matches(tracked) || Boolean(node.querySelector(tracked)));
    const observer = new MutationObserver(records => {
      if (records.some(record => Array.from(record.addedNodes).some(containsTracked)
        || Array.from(record.removedNodes).some(containsTracked))) refresh();
    });
    observer.observe(home, { childList: true, subtree: true });
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    refresh();
    return () => {
      observer.disconnect();
      sizes.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
}
