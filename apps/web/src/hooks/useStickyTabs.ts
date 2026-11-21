import { useEffect } from "react";

/** Show the opaque tab backing only while a sticky tab bar is against its top boundary. */
export function useStickyTabs() {
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      document.querySelectorAll<HTMLElement>(".aero-home .feed-tabs").forEach((tabs) => {
        const style = getComputedStyle(tabs);
        let scrolled = window.scrollY > 0;
        for (let parent = tabs.parentElement; parent && !scrolled; parent = parent.parentElement) {
          scrolled = parent.scrollTop > 0;
        }
        const top = Number.parseFloat(style.top);
        const stuck = style.position === "sticky" && scrolled && Number.isFinite(top)
          && tabs.getBoundingClientRect().top <= top + 0.5;
        if (stuck) tabs.dataset.stuck = "true";
        else delete tabs.dataset.stuck;
      });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const sizes = new ResizeObserver(schedule);
    const observeChrome = () => {
      const chrome = document.querySelector(".aero-window-chrome");
      if (chrome) sizes.observe(chrome);
      schedule();
    };
    const observer = new MutationObserver(observeChrome);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    observeChrome();
    return () => {
      observer.disconnect();
      sizes.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
}
