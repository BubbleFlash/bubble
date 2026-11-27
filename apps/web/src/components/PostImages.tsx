import { useState } from "react";
import ImageGallery from "./ImageGallery";
import type { FeedCardState } from "../lib/feedWindow";

export default function PostImages({ images, alt, adult, mobileCarouselFrom, retained }: { images: string[]; alt: string; adult?: boolean; mobileCarouselFrom?: number; retained?: FeedCardState }) {
  const [revealed, setRevealed] = useState(retained?.revealed ?? false);
  if (!images.length) return null;
  const concealed = Boolean(adult && !revealed);
  return <div className={`post-images${concealed ? " post-images--concealed" : ""}`}>
    <div className="post-images__gallery" ref={(node) => { node?.toggleAttribute("inert", concealed); }} aria-hidden={concealed || undefined}><ImageGallery images={images} alt={alt} mobileCarouselFrom={mobileCarouselFrom} retained={retained} /></div>
    {concealed && <button type="button" className="post-images__cover" onClick={() => { if (retained) retained.revealed = true; setRevealed(true); }}><span>Запись 18+</span><span className="post-images__show">Показать</span></button>}
  </div>;
}
