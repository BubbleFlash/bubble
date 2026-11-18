import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import * as mail from "../services/emailTemplates.js";

const output = resolve(process.argv[2] ?? "../../dist/mail-preview");
const to = "tester@example.invalid";
const account = "Алекс";
const origin = "https://bubble.example.invalid";
const token = "preview-only";
const samples = [
  ["verify-email", mail.verifyEmailMail(to, account, `${origin}/verify-email?token=${token}`)],
  ["reset-password", mail.resetPasswordMail(to, account, `${origin}/reset-password?token=${token}`)],
  ["confirm-email-change", mail.emailChangeMail(to, account, `${origin}/confirm-email-change?token=${token}`)],
  ["email-changed", mail.emailChangedMail(to, account)],
  ["password-changed", mail.passwordChangedMail(to, account, `${origin}/login`)],
  ["account-hidden", mail.accountDeletedMail(to, account, new Date("2027-06-18T09:00:00Z"), `${origin}/login`)],
  ["account-restored", mail.accountRestoredMail(to, account, origin)],
  ["contact", mail.contactMail(to, account, "alex@example.invalid", "Привет! Хочу предложить новую тему для оформления Bubble.")],
  ["error-alert", mail.errorAlertMail(to, "web", "/feed", "Не удалось загрузить ленту.", `${origin}/admin/errors`)],
] as const;

await mkdir(output, { recursive: true });
await Promise.all([
  copyFile(resolve("../web/public/bubble-logo-v3.png"), join(output, "bubble-logo-v3.png")),
  copyFile(resolve("../web/public/fonts/Coiny-Regular.ttf"), join(output, "Coiny-Regular.ttf")),
]);
await Promise.all(samples.flatMap(([name, message]) => [
  writeFile(join(output, `${name}.html`), message.html
    .replace(/https?:\/\/[^"']+\/bubble-logo-v3\.png/g, "./bubble-logo-v3.png")
    .replace(/https?:\/\/[^"']+\/fonts\/Coiny-Regular\.ttf/g, "./Coiny-Regular.ttf")),
  writeFile(join(output, `${name}.txt`), message.text),
]));
const links = samples.map(([name, message]) =>
  `<li><a href="${name}.html">${message.subject}</a> · <a href="${name}.txt">текст</a></li>`).join("\n");
await writeFile(join(output, "index.html"), `<!doctype html>
<html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Письма Bubble</title><style>
body{font:16px/1.6 "Segoe UI",Arial,sans-serif;color:#123b60;background:#e4f3fc;margin:0;padding:20px}
main{max-width:580px;margin:auto;padding:20px;border:1px solid #8bbbd7;border-radius:10px;background:#f2faff}
h1{margin:0}a{color:#165c93}li{margin-block:8px}
</style><main><h1>Письма Bubble</h1><p>Примеры с вымышленными данными. Ссылки внутри писем демонстрационные.</p>
<ul>${links}</ul></main></html>`);
process.stdout.write(`${join(output, "index.html")}\n`);
