import { useRef, type PointerEvent } from "react";

function isBackdrop(event: PointerEvent<HTMLDialogElement>) {
  if (event.target !== event.currentTarget) return false;
  const { left, top, right, bottom } = event.currentTarget.getBoundingClientRect();
  return event.clientX < left || event.clientX >= right ||
    event.clientY < top || event.clientY >= bottom;
}

/** Close only if the entire primary pointer gesture took place outside the dialog. */
export function useDialogBackdrop(onDismiss: () => void) {
  const pointer = useRef<number>();
  return {
    onPointerDown(event: PointerEvent<HTMLDialogElement>) {
      pointer.current = event.isPrimary && event.button === 0 && isBackdrop(event)
        ? event.pointerId : undefined;
    },
    onPointerUp(event: PointerEvent<HTMLDialogElement>) {
      const dismiss = pointer.current === event.pointerId && isBackdrop(event);
      pointer.current = undefined;
      if (dismiss) onDismiss();
    },
    onPointerCancel() {
      pointer.current = undefined;
    },
  };
}
