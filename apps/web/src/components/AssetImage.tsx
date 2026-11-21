import { useState, type ImgHTMLAttributes } from "react";
import { assetUrl } from "../lib/api";

/** Opt in to short-lived storage redirects, with a same-origin fallback on failure. */
export default function AssetImage({
  src,
  onError,
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  const [failedSource, setFailedSource] = useState<string>();
  const localUpload = Boolean(src?.startsWith("/uploads/"));
  const proxy = localUpload ? assetUrl(src) : src;
  const direct = localUpload && failedSource !== src;
  return (
    <img
      {...props}
      src={direct ? `${proxy}?direct=1` : proxy}
      onError={(event) => {
        if (direct) setFailedSource(src);
        else onError?.(event);
      }}
    />
  );
}
