export default function OnlineStatus({
  online = false,
  showText = false,
  onlineText = "Онлайн",
}: {
  online?: boolean;
  showText?: boolean;
  onlineText?: string;
}) {
  const label = online ? onlineText : "Офлайн";
  return (
    <span
      className="online-status"
      data-online={online}
      title={showText ? undefined : label}
      role={showText ? undefined : "img"}
      aria-label={showText ? undefined : label}
    >
      <span className="online-status-dot" aria-hidden="true" />
      {showText && label}
    </span>
  );
}
