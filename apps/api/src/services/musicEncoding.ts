import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";
import { MAX_MUSIC_BYTES } from "@commune/shared";

const run = promisify(execFile);
const inputOptions = ["-protocol_whitelist", "file", "-format_whitelist", "mp3,flac,wav,mov,ogg"];
const options = { timeout: 300_000, killSignal: "SIGKILL" as const, windowsHide: true, maxBuffer: 256 * 1024 };
export class InvalidMusicFile extends Error {}

async function mediaTool(command: string, args: string[]) {
  try {
    return await run(command, args, options);
  } catch (error) {
    if (error instanceof Error && "code" in error && typeof error.code === "number") throw new InvalidMusicFile("Audio processing failed");
    throw error;
  }
}

async function inspect(path: string) {
  const { stdout } = await mediaTool("ffprobe", ["-v", "error", ...inputOptions, "-select_streams", "a:0",
    "-show_entries", "format=format_name:stream=codec_name,bit_rate,channels", "-of", "json", path]);
  const info = JSON.parse(stdout) as {
    streams: { codec_name: string; bit_rate?: string; channels: number }[];
    format: { format_name: string };
  };
  const stream = info.streams[0];
  if (!stream) throw new InvalidMusicFile("Missing audio stream");
  return { codec: stream.codec_name, format: info.format.format_name, bitrate: Number(stream.bit_rate), channels: stream.channels };
}

function durationFromProgress(stdout: string) {
  const last = [...stdout.matchAll(/^out_time_us=(\d+)/gm)].at(-1);
  const seconds = Number(last?.[1]) / 1e6;
  if (!(seconds > 0)) throw new InvalidMusicFile("Missing decoded audio");
  return seconds;
}

/** Return a fully decodable MP3. The caller owns both temporary paths. */
export async function prepareMusicMp3(input: string, output: string) {
  const source = await inspect(input);
  const keep = source.format === "mp3" && source.codec === "mp3" && source.bitrate > 0 && source.bitrate <= 192_000;
  const ffmpeg = ["-nostdin", "-v", "error", "-xerror", "-progress", "pipe:1", "-nostats", ...inputOptions, "-threads", "1", "-i"];
  let encodedDuration;
  if (!keep) {
    const limit = MAX_MUSIC_BYTES * 4;
    const { stdout } = await mediaTool("ffmpeg", [...ffmpeg, input, "-map", "0:a:0", "-map_metadata", "-1", "-vn",
      "-c:a", "libmp3lame", "-ac", String(Math.min(source.channels, 2)), "-q:a", "2", "-threads", "1", "-fs", String(limit),
      "-f", "mp3", output]);
    if ((await stat(output)).size >= limit) throw new InvalidMusicFile("Encoded audio too large");
    encodedDuration = durationFromProgress(stdout);
  }
  const path = keep ? input : output;
  // Decode to the end as well: a readable header alone cannot detect a truncated last segment.
  const { stdout } = await mediaTool("ffmpeg", [...ffmpeg, path, "-map", "0:a:0", "-f", "null", "-"]);
  const duration = durationFromProgress(stdout);
  if (encodedDuration !== undefined && Math.abs(encodedDuration - duration) > 0.25) throw new InvalidMusicFile("MP3 duration mismatch");
  return { path, duration, size: (await stat(path)).size };
}
