import { useEffect, useState, useSyncExternalStore } from "react";
import { validateImage } from "../lib/images";
import { POST_PHOTO, prepareImage } from "../lib/images";
import { api } from "../lib/api";
import { uploadImage } from "../lib/upload";
import {createId} from "../lib/uuid";

type DraftImage = { id: string; file: File; preview: string; url?: string; error?: string; pending: boolean; progress?: number };

/** Owns previews independently of the form when a feed row is temporarily unmounted. */
export function createImageDraftStore() {
  let images: DraftImage[] = [];
  const listeners = new Set<() => void>();
  return {
    read: () => images,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    update(next: (items: DraftImage[]) => DraftImage[]) {
      images = next(images);
      listeners.forEach(listener => listener());
    },
    dispose() {
      images.forEach(image => URL.revokeObjectURL(image.preview));
      images = [];
    },
  };
}

export type ImageDraftStore = ReturnType<typeof createImageDraftStore>;

export function useImageDraft(privateMessage = false, maxImages = 10, retained?: ImageDraftStore) {
  const [local] = useState(createImageDraftStore);
  const store = retained ?? local;
  const images = useSyncExternalStore(store.subscribe, store.read);
  const [error, setError] = useState<string | null>(null);
  const update = store.update;
  useEffect(() => () => { local.dispose(); }, [local]);
  const run = (image: DraftImage) => {
    update((items) => items.map((item) => item.id === image.id ? { ...item, pending: true, error: undefined, progress: undefined } : item));
    const progress = (value: number) => update((items) => items.map((item) => item.id === image.id ? { ...item, progress: value } : item));
    const uploadFile = (async () => {
      const file = await prepareImage(image.file, POST_PHOTO);
      progress(0);
      if (!store.read().some(item => item.id === image.id)) throw new Error("Черновик закрыт");
      if (!privateMessage) return uploadImage(file, progress, "post");
      const body = new FormData();
      body.append("file", file);
      return api<{ url: string }>("/messages/images", { method: "POST", body, onUploadProgress: progress });
    })();
    void uploadFile.then(({ url }) => update((items) => items.map((item) => item.id === image.id ? { ...item, pending: false, url } : item)))
      .catch((err: Error) => update((items) => items.map((item) => item.id === image.id ? { ...item, pending: false, error: err.message } : item)));
  };
  const add = (files: File[]) => {
    if (store.read().length + files.length > maxImages) { setError(`Можно прикрепить не более ${maxImages} изображений.`); return; }
    const invalid = files.map(validateImage).find(Boolean);
    if (invalid) { setError(invalid); return; }
    setError(null);
    const next = files.map((file) => ({ id: createId(), file, preview: URL.createObjectURL(file), pending: true }));
    update((items) => [...items, ...next]);
    next.forEach(run);
  };
  const remove = (id: string) => { const image = store.read().find((item) => item.id === id); if (image) URL.revokeObjectURL(image.preview); update((items) => items.filter((item) => item.id !== id)); };
  const clear = () => { store.dispose(); update(() => []); setError(null); };
  return { images, error, add, remove, clear, retry: run, busy: images.some((item) => item.pending), ready: images.every((item) => Boolean(item.url)) };
}
