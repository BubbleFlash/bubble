import type { Request, Response } from "express";
import { setTimeout as sleep } from "node:timers/promises";
import type {
  MusicUploadSignInput,
  MusicUploadTicket,
  MusicUploadCompleteInput,
  MusicListQuery,
  MusicTrackDTO,
} from "@commune/shared";
import {
  completeMusicUpload,
  musicUploadStatus,
  createMusicUpload,
} from "../services/musicUploadService.js";
import {
  addTrackToLibrary,
  getMusicPlaybackUrl,
  getMusicDownloadUrl,
  listMusic,
  removeTrackFromLibrary,
  listPickerMusic,
} from "../services/musicService.js";
import { UserMusic } from "../models/UserMusic.js";
import { MusicTrack } from "../models/MusicTrack.js";
import { forbidden } from "../utils/errors.js";

export async function libraryStatus(req: Request, res: Response) {
  res.set("Cache-Control", "private, no-store");
  res.json({ added: Boolean(await UserMusic.exists({ userId: req.userId!, trackId: req.params.id! })) });
}

export async function libraryStatuses(req: Request, res: Response) {
  res.set("Cache-Control", "private, no-store");
  const entries = await UserMusic.find({ userId: req.userId!, trackId: { $in: req.body.ids } }).select("trackId").lean();
  res.json({ ids: entries.map((entry) => entry.trackId.toString()) });
}

export async function picker(req: Request, res: Response) {
  res.set("Cache-Control", "private, no-store");
  res.json(await listPickerMusic(req.userId!, res.locals.query));
}

export async function signUpload(req: Request, res: Response) {
  res.set("Cache-Control", "no-store");

  const body: MusicUploadTicket = await createMusicUpload(
    req.userId!,
    req.body as MusicUploadSignInput,
  );

  res.status(201).json(body);
}

export async function completeUpload(req: Request, res: Response) {
  const { uploadId, duration, background } = req.body as MusicUploadCompleteInput;
  let result = await completeMusicUpload(req.userId!, uploadId, duration);
  // Older clients expect a published track ID in the completion response.
  while (!background && "processing" in result && !res.destroyed) {
    await sleep(2000);
    result = await musicUploadStatus(req.userId!, uploadId);
  }
  if (!res.destroyed) res.status("processing" in result ? 202 : 201).json(result);
}

export async function uploadStatus(req: Request, res: Response) {
  res.set("Cache-Control", "no-store");
  res.json(await musicUploadStatus(req.userId!, req.params.id!));
}

export async function rename(req: Request, res: Response) {
  const track = await MusicTrack.findOneAndUpdate(
    { _id: req.params.id, uploadedBy: req.userId!, createdAt: { $gt: new Date(Date.now() - 5 * 60_000) } },
    { $set: { title: req.body.title, artist: req.body.artist } },
    { new: true, runValidators: true },
  ).lean();
  if (!track) throw forbidden("The editing period has expired or you are not the uploader");
  res.json({ id: track._id.toString(), title: track.title, artist: track.artist });
}

export async function list(req: Request, res: Response) {
  res.set("Cache-Control", "no-store");

  const tracks: MusicTrackDTO[] = await listMusic(
    req.userId!,
    req.query as unknown as MusicListQuery,
  );

  res.json(tracks);
}

export async function addToLibrary(req: Request, res: Response) {
  await addTrackToLibrary(req.userId!, req.params.id!);
  res.status(204).end();
}

export async function removeFromLibrary(req: Request, res: Response) {
  await removeTrackFromLibrary(req.userId!, req.params.id!);
  res.status(204).end();
}

export async function play(req: Request, res: Response) {
  res.set("Cache-Control", "no-store");

  const url = await getMusicPlaybackUrl(req.params.id!);

  res.json({ url });
}

export async function download(req: Request, res: Response) {
  res.set("Cache-Control", "no-store");
  res.json({ url: await getMusicDownloadUrl(req.params.id!) });
}
