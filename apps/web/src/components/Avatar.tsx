import type { CSSProperties } from "react";
import { displayNameOf, avatarFrameSchema, type AvatarFrame } from "@commune/shared";
import { useAuth } from "../store/auth";
import AssetImage from "./AssetImage";
import { hueFor } from "../lib/hue";
import { Link } from "react-router-dom";
import { useProfilePresence } from "../hooks/useProfilePresence";
import { useNearViewport } from "../hooks/useNearViewport";
import OnlineStatus from "./OnlineStatus";

/** Opt-in link: keep the base Avatar decorative inside existing links. */
export function ProfileAvatar(props: Parameters<typeof Avatar>[0]) {
  return <Link className="profile-avatar-link" to={`/u/${props.username}`} aria-label={`Открыть профиль ${displayNameOf(props)}`}><Avatar trackOnline {...props} /></Link>;
}

/** Profile photo, or a colored circle with the user's initial when there is none. */
export default function Avatar({
  username,
  displayName,
  url,
  size = 40,
  frame,
  preview = false,
  trackOnline = false,
  online,
}: {
  username: string;
  displayName?: string;
  url?: string | null;
  size?: number;
  frame?: AvatarFrame | null;
  preview?: boolean;
  trackOnline?: boolean;
  online?: boolean;
}) {
  const { user, confirmed } = useAuth();
  const isMe = user?.username === username;
  const presence = useProfilePresence(username, Boolean(user && confirmed && trackOnline && online === undefined && !isMe));
  const status = isMe ? true : online ?? presence;
  const effect = avatarFrameSchema.safeParse(
    user?.username === username && !preview ? user.avatarFrame : frame,
  ).data;
  const style = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.42),
    ...(effect && {
      "--avatar-glow": effect.color,
      "--avatar-glow-radius": `${effect.intensity * 1.2 + 1}px`,
    }),
  } as CSSProperties;
  const effectName = effect?.effect;
  const { ref, near } = useNearViewport<HTMLElement>("96px 0px", false);
  const pulseRef = effectName === "pulse" ? ref : undefined;
  const pulsing = effectName === "pulse" && near;
  const hue = hueFor(username);
  const avatar = url ? (
    <AssetImage className="avatar" imageRef={pulseRef} data-frame={effectName} src={url} alt="" style={style} loading="lazy" decoding="async" width={size} height={size} />
  ) : (
    <span
      ref={pulseRef}
      className="avatar avatar-fallback"
      data-frame={effectName}
      style={{ ...style, background: hue.bg, color: hue.fg }}
      aria-hidden="true"
    >
      {Array.from(displayNameOf({ username, displayName }))[0]?.toUpperCase()}
    </span>
  );
  if (!trackOnline && online === undefined && !pulseRef) return avatar;
  return <span className={pulseRef ? "avatar-presence avatar-pulse" : "avatar-presence"} data-pulse-halo={pulsing || undefined} style={pulseRef ? style : { width: size, height: size }}>
    {avatar}
    {(trackOnline || online !== undefined) && status !== undefined && <OnlineStatus online={status} />}
  </span>;
}
