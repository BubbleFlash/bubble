import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { createInterface } from "node:readline";
import { MAX_MUSIC_BYTES } from "@commune/shared";
import type { MusicUploadStage } from "@commune/shared";
import { env } from "../config/env.js";

const run = promisify(execFile);
const inputOptions = ["-protocol_whitelist", "file", "-format_whitelist", "mp3,flac,wav,mov,ogg"];
const options = { timeout: 300_000, killSignal: "SIGKILL" as const, windowsHide: true, maxBuffer: 256 * 1024 };
export class InvalidMusicFile extends Error {}
export class MusicToolsUnavailable extends Error {}

type Tool = "ffmpeg" | "ffprobe";
let validatedToolPath: string | undefined;

function executable(command: Tool) {
  return env.MUSIC_FFMPEG_DIR
    ? join(env.MUSIC_FFMPEG_DIR, command + (process.platform === "win32" ? ".exe" : ""))
    : command;
}

export async function checkMusicTools() {
  const toolPath = env.MUSIC_FFMPEG_DIR ?? process.env.PATH ?? "";
  if (validatedToolPath === toolPath) return;
  try {
    const probe = { ...options, timeout: 5000 };
    const [, encoders] = await Promise.all([
      run(executable("ffprobe"), ["-version"], probe),
      run(executable("ffmpeg"), ["-hide_banner", "-encoders"], probe),
    ]);
    if (!/\blibmp3lame\b/.test(encoders.stdout)) throw new Error("Missing libmp3lame");
    validatedToolPath = toolPath;
  } catch (error) {
    throw new MusicToolsUnavailable("Cannot run FFmpeg/FFprobe with libmp3lame", { cause: error });
  }
}

async function mediaTool(command: Tool, args: string[], onProgress?: (seconds: number) => void) {
  try {
    const execution = run(executable(command), args, options);
    const stdout = execution.child.stdout;
    const lines = onProgress && stdout ? createInterface({ input: stdout }) : undefined;
    lines?.on("line", line => {
      const match = /^out_time_us=(\d+)$/.exec(line);
      if (match) onProgress?.(Number(match[1]) / 1e6);
    });
    try {
      return await execution;
    } finally {
      lines?.close();
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && ["ENOENT", "EACCES", "EPERM"].includes(String(error.code))) {
      validatedToolPath = undefined;
      throw new MusicToolsUnavailable(`Cannot run ${command}`, { cause: error });
    }
    if (error instanceof Error && "code" in error && typeof error.code === "number") throw new InvalidMusicFile("Audio processing failed");
    throw error;
  }
}

async function inspect(path: string) {
  const { stdout } = await mediaTool("ffprobe", ["-v", "error", ...inputOptions, "-select_streams", "a:0",
    "-show_entries", "format=format_name,duration:stream=codec_name,bit_rate,channels,duration", "-of", "json", path]);
  const info = JSON.parse(stdout) as {
    streams: { codec_name: string; bit_rate?: string; channels: number; duration?: string }[];
    format: { format_name: string; duration?: string };
  };
  const stream = info.streams[0];
  if (!stream) throw new InvalidMusicFile("Missing audio stream");
  const duration = [stream.duration, info.format.duration].map(Number).find(seconds => Number.isFinite(seconds) && seconds > 0);
  return { codec: stream.codec_name, format: info.format.format_name, bitrate: Number(stream.bit_rate), channels: stream.channels, duration };
}

function durationFromProgress(stdout: string) {
  const last = [...stdout.matchAll(/^out_time_us=(\d+)/gm)].at(-1);
  const seconds = Number(last?.[1]) / 1e6;
  if (!(seconds > 0)) throw new InvalidMusicFile("Missing decoded audio");
  return seconds;
}

/** Return a fully decodable MP3. The caller owns both temporary paths. */
export async function prepareMusicMp3(input: string, output: string, progress?: {
  stage: (stage: MusicUploadStage, duration?: number) => Promise<void>;
  processed: (seconds: number) => void;
}) {
  await progress?.stage("inspecting");
  const source = await inspect(input);
  const keep = source.format === "mp3" && source.codec === "mp3" && source.bitrate > 0 && source.bitrate <= 192_000;
  const ffmpeg = ["-nostdin", "-v", "error", "-xerror", "-progress", "pipe:1", "-nostats", ...inputOptions, "-threads", "1", "-i"];
  let encodedDuration;
  if (!keep) {
    await progress?.stage("converting", source.duration);
    const limit = MAX_MUSIC_BYTES * 4;
    const { stdout } = await mediaTool("ffmpeg", [...ffmpeg, input, "-map", "0:a:0", "-map_metadata", "-1", "-vn",
      "-c:a", "libmp3lame", "-ac", String(Math.min(source.channels, 2)), "-q:a", "2", "-threads", "1", "-fs", String(limit),
      "-f", "mp3", output], progress?.processed);
    if ((await stat(output)).size >= limit) throw new InvalidMusicFile("Encoded audio too large");
    encodedDuration = durationFromProgress(stdout);
  }
  const path = keep ? input : output;
  // Decode to the end as well: a readable header alone cannot detect a truncated last segment.
  await progress?.stage("validating", encodedDuration ?? source.duration);
  const { stdout } = await mediaTool("ffmpeg", [...ffmpeg, path, "-map", "0:a:0", "-f", "null", "-"], progress?.processed);
  const duration = durationFromProgress(stdout);
  if (encodedDuration !== undefined && Math.abs(encodedDuration - duration) > 0.25) throw new InvalidMusicFile("MP3 duration mismatch");
  return { path, duration, size: (await stat(path)).size };
}
