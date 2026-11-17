import type { CSSProperties } from "react";
import { appearanceColorSchema, uploadUrlSchema, windowOpacitySchema, type SiteAppearance } from "@commune/shared";
import { assetUrl } from "./api";

export const DEFAULT_WALLPAPER = "/bubble-background.jpg";
export const DEFAULT_PRIMARY = "#349af4";
export const DEFAULT_ACCENT = "#bfec67";

function luminance(color: string) {
  const [red, green, blue] = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrastInk(color: string) {
  return luminance(color) > 0.195 ? "#000" : "#fff";
}

function playerIconColor(color: string) {
  const background = luminance("#35434d");
  const accent = luminance(color);
  const contrast = (Math.max(background, accent) + 0.05) / (Math.min(background, accent) + 0.05);
  return contrast >= 2.3 ? color : "#e1e8ed";
}

export function appearanceStyle(appearance?: Partial<SiteAppearance>, fontFamily?: string, localWallpaper?: string): CSSProperties {
  const primary = appearanceColorSchema.safeParse(appearance?.primaryColor).data;
  const accent = appearanceColorSchema.safeParse(appearance?.accentColor).data;
  const path = uploadUrlSchema.safeParse(appearance?.backgroundUrl).data;
  const wallpaper = localWallpaper ?? assetUrl(path);
  const opacity = windowOpacitySchema.safeParse(appearance?.windowOpacity).data;
  return {
    "--aero-site-font": fontFamily,
    "--aero-chosen-primary": primary,
    "--aero-chosen-accent": accent,
    "--aero-chosen-accent-ink": accent && contrastInk(accent),
    "--aero-player-icon": accent && playerIconColor(accent),
    "--aero-wallpaper": wallpaper && `url(${JSON.stringify(wallpaper)})`,
    "--aero-window-opacity": opacity === undefined ? undefined : `${opacity}%`,
  } as CSSProperties;
}
