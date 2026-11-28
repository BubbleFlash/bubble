import { useState, type ImgHTMLAttributes, type Ref } from "react";
import { imagePreviews, type ImagePreviewKind } from "@commune/shared";
import { assetUrl } from "../lib/api";

/** Opt in to short-lived storage redirects, with a same-origin fallback on failure. */
export default function AssetImage({
  src,
  onError,
  imageRef,
  preview,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { imageRef?: Ref<HTMLImageElement>; preview?: ImagePreviewKind }) {
  const [failedSource, setFailedSource] = useState<string>();
  const localUpload = Boolean(src?.startsWith("/uploads/"));
  const proxy = localUpload ? assetUrl(src) : src;
  const direct = localUpload && failedSource !== src;
  const original = direct ? `${proxy}?direct=1` : proxy;
  const variants = direct && src && preview ? imagePreviews(src) : undefined;
  const srcSet = variants && variants.kind === preview
    ? [...variants.widths.map(width => `${proxy}?w=${width} ${width}w`), `${original} ${variants.originalWidth}w`].join(", ")
    : props.srcSet;
  return (
    <img
      {...props}
      ref={imageRef}
      src={original}
      srcSet={srcSet}
      onError={(event) => {
        if (direct) setFailedSource(src);
        else onError?.(event);
      }}
    />
  );
}
