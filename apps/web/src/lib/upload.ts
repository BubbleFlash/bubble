import type { ImagePreviewKind, UploadResponse } from "@commune/shared";
import { api } from "./api";

/** A signed storage URL is used without API credentials or cookies. */
export function putSignedUpload(url: string, file: File, mimeType: string, onProgress: (percent: number) => void, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", mimeType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.floor(event.loaded / event.total * 100));
    };
    const fail = () => reject(new Error("Не удалось передать файл в хранилище. Повторите загрузку."));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else fail();
    };
    xhr.onerror = fail;
    xhr.onabort = () => reject(signal.reason ?? new DOMException("Upload aborted", "AbortError"));
    xhr.onloadend = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    xhr.send(file);
  });
}

/**
 * Uploads one prepared image through the API.
 * Resolves with the reference to store on a post, profile or wallpaper.
 */
export async function uploadImage(
  file: File,
  onProgress?: (percent: number) => void,
  preview?: ImagePreviewKind,
): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);

  onProgress?.(0);

  const result = await api<UploadResponse>(preview ? `/uploads?preview=${preview}` : "/uploads", {
    method: "POST",
    body: form,
    onUploadProgress: onProgress,
  });


  return result;
}
