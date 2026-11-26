import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent, PointerEvent, TouchEvent } from "react";
import AssetImage from "./AssetImage";
import { useDialogBackdrop } from "../hooks/useDialogBackdrop";
import { useNearViewport } from "../hooks/useNearViewport";

function GalleryImage({ src, alt, onSettled }: { src: string; alt: string; onSettled?: (loaded: boolean) => void }) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  useLayoutEffect(() => {
    if (state !== "loading") onSettled?.(state === "loaded");
  }, [state, onSettled]);
  return <span className={`gallery-image${state === "loaded" ? "" : " gallery-image--waiting"}`}>
    {state === "loading" && <span className="gallery-image__loading" role="status" aria-label="Загрузка изображения" />}
    {state === "error" && <span className="gallery-image__error">Не удалось загрузить изображение</span>}
    <AssetImage src={src} alt={alt} draggable={false} loading="eager" decoding="async"
      onLoad={() => setState("loaded")} onError={() => setState("error")} />
  </span>;
}

export default function ImageGallery({ images, alt, mobileCarouselFrom = 3 }: { images: string[]; alt: string; mobileCarouselFrom?: number }) {
  const [index, setIndex] = useState<number | null>(null);
  const [slide, setSlide] = useState(0);
  const [readySlide, setReadySlide] = useState<{ index: number; url: string }>();
  const [failedSlide, setFailedSlide] = useState<number>();
  const { ref: gallery, near } = useNearViewport<HTMLDivElement>("240px 0px");
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 600px)").matches);
  const [showArrows, setShowArrows] = useState(true);
  const [fullSize, setFullSize] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const imageScroll = useRef<HTMLDivElement>(null);
  const backdrop = useDialogBackdrop(() => dialog.current?.close());
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const touch = useRef<{ x: number; y: number } | null>(null);
  const mouseDrag = useRef<{ id: number; x: number; y: number; dragging: boolean } | null>(null);
  const suppressClick = useRef(false);
  const clickTimer = useRef<ReturnType<typeof setTimeout>>();
  const showTemporarily = (isTouch = window.matchMedia("(pointer: coarse)").matches) => {
    setShowArrows(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowArrows(false), isTouch ? 500 : 2200);
  };
  useEffect(() => {
    const media = window.matchMedia("(max-width: 600px)");
    const update = () => setMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => () => { clearTimeout(hideTimer.current); clearTimeout(clickTimer.current); }, []);
  useEffect(() => {
    if (index !== null && !dialog.current?.open) { dialog.current?.showModal(); showTemporarily(); }
  }, [index]);
  useEffect(() => {
    imageScroll.current?.scrollTo(0, 0);
  }, [index, fullSize]);
  const requestedSlide = images.length ? slide % images.length : 0;
  const requestedUrl = images[requestedSlide];
  const settleSlide = useCallback((loaded: boolean) => {
    if (loaded && requestedUrl) setReadySlide({ index: requestedSlide, url: requestedUrl });
    else setFailedSlide(requestedSlide);
  }, [requestedSlide, requestedUrl]);
  if (!images.length) return null;
  const move = (offset: number) => setIndex((current) => current === null ? null : (current + offset + images.length) % images.length);
  const visibleSlide = readySlide && images[readySlide.index] === readySlide.url ? readySlide.index : requestedSlide;
  const switching = visibleSlide !== requestedSlide;
  const carousel = images.length >= (mobile ? mobileCarouselFrom : 5);
  const slides = images.map((url, i) => {
    const distance = Math.abs(i - requestedSlide);
    // Keep the displayed image mounted while loading the requested image and its neighbors.
    if (carousel && i !== visibleSlide && (!near || Math.min(distance, images.length - distance) > 1)) return null;
    return <button type="button" className="image-gallery__item" key={`${url}-${i}`}
      hidden={carousel && i !== visibleSlide} onClick={() => setIndex(i)}
      aria-label={`Открыть изображение ${i + 1} из ${images.length}`}>
      {near ? <GalleryImage src={url} alt={alt} onSettled={carousel && i === requestedSlide ? settleSlide : undefined} /> : <span className="gallery-image gallery-image--waiting" />}
    </button>;
  });
  const moveSlide = (offset: number) => {
    setFailedSlide(undefined);
    setSlide(current => (current + offset + images.length) % images.length);
  };
  const startSwipe = (event: TouchEvent) => {
    if (event.touches.length !== 1) { touch.current = null; return; }
    touch.current = { x: event.touches[0]!.clientX, y: event.touches[0]!.clientY };
  };
  const endSwipe = (event: TouchEvent, action: (offset: number) => void) => {
    const start = touch.current;
    touch.current = null;
    const end = event.changedTouches[0];
    if (!start || !end) return;
    const dx = end.clientX - start.x;
    const dy = end.clientY - start.y;
    if (Math.abs(dx) < 45 || Math.abs(dx) <= Math.abs(dy) * 1.2) return;
    suppressClick.current = true;
    clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => { suppressClick.current = false; }, 500);
    action(dx < 0 ? 1 : -1);
  };
  const preventSwipeClick = (event: MouseEvent) => {
    if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; }
  };
  const mouseDown = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0 || !event.isPrimary) return;
    mouseDrag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, dragging: false };
  };
  const mouseMove = (event: PointerEvent<HTMLElement>) => {
    const start = mouseDrag.current;
    if (!start || start.id !== event.pointerId || !(event.buttons & 1)) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.dragging && Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      start.dragging = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };
  const mouseUp = (event: PointerEvent<HTMLElement>, action: (offset: number) => void) => {
    const start = mouseDrag.current;
    if (!start || start.id !== event.pointerId) return;
    mouseDrag.current = null;
    if (!start.dragging) return;
    suppressClick.current = true;
    clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => { suppressClick.current = false; }, 500);
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.2) action(dx < 0 ? 1 : -1);
  };
  return <>
    {carousel ? <div ref={gallery} className="image-gallery image-gallery--carousel" onPointerDown={mouseDown} onPointerMove={mouseMove} onPointerUp={(event) => mouseUp(event, moveSlide)} onPointerCancel={() => { mouseDrag.current = null; }} onDragStart={(event) => event.preventDefault()} onTouchStart={startSwipe} onTouchEnd={(event) => endSwipe(event, moveSlide)} onTouchCancel={() => { touch.current = null; }} onClickCapture={preventSwipeClick}>
      {slides}
      {switching && (failedSlide === requestedSlide
        ? <span className="image-gallery__feedback gallery-image__error" role="status">Не удалось загрузить изображение</span>
        : <span className="image-gallery__feedback gallery-image__loading" role="status" aria-label="Загрузка изображения" />)}
      <span className="image-gallery__count" aria-live="polite">{visibleSlide + 1} / {images.length}</span>
      <button type="button" className="image-gallery__zone image-gallery__zone--previous" aria-label="Предыдущее фото" onClick={() => moveSlide(-1)}><span className="image-gallery__arrow" aria-hidden="true">‹</span></button>
      <button type="button" className="image-gallery__zone image-gallery__zone--next" aria-label="Следующее фото" onClick={() => moveSlide(1)}><span className="image-gallery__arrow" aria-hidden="true">›</span></button>
    </div> : <div ref={gallery} className={`image-gallery image-gallery--${images.length}`}>
      {slides}
    </div>}
    <dialog ref={dialog} {...backdrop} className={`image-viewer${showArrows ? "" : " image-viewer--idle"}`} aria-label="Просмотр изображения" onClose={() => { clearTimeout(hideTimer.current); setIndex(null); setFullSize(false); }} onPointerMove={(event) => showTemporarily(event.pointerType === "touch")} onKeyDown={(event) => {
      showTemporarily(false);
      if (images.length < 2 || (fullSize && event.target === imageScroll.current)) return;
      if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
      if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
    }}>
      <div className="image-viewer__header">
        <span>{index === null ? "" : `${index + 1} / ${images.length}`}</span>
        <button className="btn btn-ghost image-viewer__fit" type="button" aria-pressed={fullSize} onClick={() => setFullSize((value) => !value)}>
          {fullSize ? "Вместить" : "Исходный размер"}
        </button>
        <span className="aero-window-controls">
          <button className="aero-window-control aero-window-close" type="button" aria-label="Закрыть просмотр" title="Закрыть" onClick={() => dialog.current?.close()}>
            <i className="aero-control-close" aria-hidden="true" />
          </button>
        </span>
      </div>
      <div className={`image-viewer__content${fullSize ? " image-viewer__content--full" : ""}`} onPointerDown={!fullSize && images.length > 1 ? mouseDown : undefined} onPointerMove={!fullSize && images.length > 1 ? mouseMove : undefined} onPointerUp={!fullSize && images.length > 1 ? (event) => mouseUp(event, move) : undefined} onPointerCancel={() => { mouseDrag.current = null; }} onDragStart={(event) => event.preventDefault()} onTouchStart={(event) => { showTemporarily(true); if (!fullSize) startSwipe(event); }} onTouchEnd={(event) => { showTemporarily(true); if (!fullSize && images.length > 1) endSwipe(event, move); }} onTouchCancel={() => { touch.current = null; }} onClickCapture={preventSwipeClick}>
        <div className="image-viewer__scroll" ref={imageScroll} tabIndex={fullSize ? 0 : undefined} aria-label={fullSize ? "Прокрутка изображения" : undefined}>
          {index !== null && <AssetImage src={images[index]} alt={`${alt}, ${index + 1} из ${images.length}`} draggable={false} />}
        </div>
        {images.length > 1 && <><button type="button" className="image-viewer__zone image-viewer__zone--previous" aria-label="Предыдущее изображение" onClick={() => move(-1)}><span className="image-viewer__arrow" aria-hidden="true">‹</span></button><button type="button" className="image-viewer__zone image-viewer__zone--next" aria-label="Следующее изображение" onClick={() => move(1)}><span className="image-viewer__arrow" aria-hidden="true">›</span></button></>}
      </div>
    </dialog>
  </>;
}
