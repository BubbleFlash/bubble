import type { MusicAttachmentDTO, MusicTrackDTO } from "@commune/shared";
import MusicTrackList from "./MusicTrackList";
import { useNearViewport } from "../hooks/useNearViewport";

export default function MusicAttachments({ attachments, source }: { attachments: MusicAttachmentDTO[]; source: string }) {
  const { ref, near } = useNearViewport<HTMLDivElement>();
  const tracks: MusicTrackDTO[] = attachments.flatMap((item) => item.unavailable ? [] : [{ ...item, mimeType: "", size: 0, addedAt: null, addedByMe: false }]);
  return <div ref={ref} className="music-attachments"><MusicTrackList tracks={tracks} source={source} order={attachments.map((item) => item.id)} loadLibraryStatus={near} /></div>;
}
