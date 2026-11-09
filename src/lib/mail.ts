import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env";

export type Mail = { to: string; subject: string; text: string; html: string };

// Fallback sink used when SMTP isn't configured (unit/integration tests).
export const outbox: Mail[] = [];

let transporter: Transporter | undefined;

export async function sendMail(mail: Mail): Promise<void> {
  const e = env();
  if (!e.SMTP_HOST) {
    outbox.push(mail);
    if (process.env.NODE_ENV !== "test") {
      console.info(`[mail] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
    }
    return;
  }
  transporter ??= nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_PORT === 465,
    auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
  });
  await transporter.sendMail({ from: e.EMAIL_FROM, ...mail });
}
