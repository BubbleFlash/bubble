import { useCallback, useLayoutEffect, type RefObject } from "react";

export function useGrowingTextarea(field: RefObject<HTMLTextAreaElement>, value: string) {
  const measure = useCallback(() => {
    const textarea = field.current;
    if (!textarea) return;
    if (!textarea.value) {
      textarea.style.removeProperty("--textarea-content-height");
      return;
    }

    const { height } = textarea.style;
    const scrollTop = textarea.scrollTop;
    // Measure the content independently of the height chosen by manual resizing.
    textarea.style.height = "0px";
    textarea.style.removeProperty("--textarea-content-height");
    const contentHeight = textarea.scrollHeight + textarea.offsetHeight - textarea.clientHeight;
    textarea.style.height = height;
    textarea.style.setProperty("--textarea-content-height", `${contentHeight}px`);
    textarea.scrollTop = scrollTop;
  }, [field]);

  useLayoutEffect(measure, [measure, value]);

  useLayoutEffect(() => {
    const textarea = field.current;
    if (!textarea) return;

    let width = textarea.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const nextWidth = textarea.getBoundingClientRect().width;
      if (nextWidth === width) return;
      width = nextWidth;
      measure();
    });
    observer.observe(textarea, { box: "border-box" });
    return () => observer.disconnect();
  }, [field, measure]);
}
