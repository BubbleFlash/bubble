import { useState } from "react";
import ImageGallery from "./ImageGallery";

export default function PostImages({ images, alt, adult }: { images: string[]; alt: string; adult?: boolean }) {
  const [revealed, setRevealed] = useState(false);
  if (!images.length) return null;
  const concealed = Boolean(adult && !revealed);
  return <div className={`post-images${concealed ? " post-images--concealed" : ""}`}>
    <div className="post-images__gallery" ref={(node) => { node?.toggleAttribute("inert", concealed); }} aria-hidden={concealed || undefined}><ImageGallery images={images} alt={alt} /></div>
    {concealed && <button type="button" className="post-images__cover" onClick={() => setRevealed(true)}><span>Запись 18+</span><span className="post-images__show">Показать</span></button>}
  </div>;
}
