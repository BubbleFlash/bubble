import { OFFICIAL_TELEGRAM_URL } from "../lib/support";

export default function TelegramWidget() {
  return <section className="aero-widget telegram-widget">
    <strong>Telegram Bubble</strong>
    <div className="telegram-widget__body">
      <a className="btn telegram-widget__link" href={OFFICIAL_TELEGRAM_URL} target="_blank" rel="noopener noreferrer">Подписаться</a>
    </div>
  </section>;
}
