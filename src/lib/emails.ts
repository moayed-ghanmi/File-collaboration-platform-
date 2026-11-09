import type { Mail } from "./mail";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function layout(heading: string, body: string, cta: string, url: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#f4f4f5;padding:24px">
<div style="max-width:480px;margin:auto;background:#fff;border-radius:8px;padding:32px">
<h1 style="font-size:20px;margin:0 0 16px">${heading}</h1>
<p style="color:#3f3f46;line-height:1.5">${body}</p>
<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#18181b;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${cta}</a></p>
<p style="color:#71717a;font-size:12px">If the button doesn't work, paste this link into your browser:<br>${escapeHtml(url)}</p>
</div></body></html>`;
}

export function verificationEmail(to: string, name: string, url: string): Mail {
  return {
    to,
    subject: "Verify your FileCollab email",
    text: `Hi ${name},\n\nConfirm your email address to finish creating your account:\n${url}\n\nThis link expires in 1 hour.`,
    html: layout(
      "Confirm your email",
      `Hi ${escapeHtml(name)}, confirm your email address to finish creating your FileCollab account. This link expires in 1 hour.`,
      "Verify email",
      url,
    ),
  };
}

export function resetPasswordEmail(to: string, name: string, url: string): Mail {
  return {
    to,
    subject: "Reset your FileCollab password",
    text: `Hi ${name},\n\nReset your password using this link:\n${url}\n\nThis link expires in 1 hour. If you didn't ask for this, ignore this email.`,
    html: layout(
      "Reset your password",
      `Hi ${escapeHtml(name)}, use the button below to choose a new password. This link expires in 1 hour. If you didn't ask for this, you can ignore this email.`,
      "Reset password",
      url,
    ),
  };
}
