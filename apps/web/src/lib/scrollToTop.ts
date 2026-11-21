/** The main area and the document can both be scroll containers at different viewport sizes. */
export function scrollToTop() {
  document.getElementById("main")?.scrollTo({ top: 0, behavior: "instant" });
  window.scrollTo({ top: 0, behavior: "instant" });
}
