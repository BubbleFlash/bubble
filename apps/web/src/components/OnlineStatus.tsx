export default function OnlineStatus({ online }: { online: boolean }) {
  const label = online ? "Онлайн" : "Офлайн";
  return <span className="online-status" data-online={online} title={label} role="img" aria-label={label} />;
}
