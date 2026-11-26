import { useCallback, useRef, useState } from "react";

const viewportObservers = new Map<string, {
  observer: IntersectionObserver;
  targets: Map<Element, (near: boolean) => void>;
}>();

function observeNearViewport(element: Element, rootMargin: string, onChange: (near: boolean) => void, once: boolean) {
  let group = viewportObservers.get(rootMargin);
  if (!group) {
    const targets = new Map<Element, (near: boolean) => void>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        targets.get(entry.target)?.(entry.isIntersecting);
      }
    }, { rootMargin });
    group = { observer, targets };
    viewportObservers.set(rootMargin, group);
  }
  const { observer, targets } = group;
  const stop = () => {
    if (targets.get(element) !== enter) return;
    targets.delete(element);
    observer.unobserve(element);
    if (!targets.size) {
      observer.disconnect();
      viewportObservers.delete(rootMargin);
    }
  };
  const enter = (near: boolean) => {
    if (once && !near) return;
    if (once) stop();
    onChange(near);
  };
  targets.set(element, enter);
  observer.observe(element);
  return stop;
}

/** Start optional requests near the viewport, then keep the content and its state. */
export function useNearViewport<T extends HTMLElement>(rootMargin = "600px 0px", once = true) {
  const stop = useRef<() => void>();
  const supported = typeof IntersectionObserver !== "undefined";
  const [near, setNear] = useState(!supported);
  const observing = supported && (!once || !near);
  const ref = useCallback((element: T | null) => {
    stop.current?.();
    stop.current = element && observing ? observeNearViewport(element, rootMargin, setNear, once) : undefined;
  }, [observing, rootMargin, once]);
  return { ref, near };
}
