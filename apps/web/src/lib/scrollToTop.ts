export function getPageScroller() {
  if (window.matchMedia("(max-width: 1100px)").matches) {
    const pane = document.querySelector("[data-aero-contained-scroll] > .aero-window");
    if (pane) return pane;
  }
  return document.scrollingElement;
}

/** Some routes have their own scroll area inside the page. */
export function scrollToTop() {
  document.getElementById("main")?.scrollTo({ top: 0, behavior: "instant" });
  getPageScroller()?.scrollTo({ top: 0, behavior: "instant" });
}
