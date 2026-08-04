import "server-only";

import nodemailer from "nodemailer";

/**
 * Email delivery.
 *
 * When SMTP is not configured — which is the default for a fresh clone — mail
 * is written to the console instead of being dropped. That matters: a developer
 * testing the invitation flow needs the invite link, and a self-hoster who
 * hasn't set up SMTP yet should see clearly that mail is not going out, rather
 * than wonder why nobody received anything.
 */

interface MailInput {
  to: string;
  subject: string;
  /** Plain-text body. Always provided — some recipients never render HTML. */
  text: string;
  html?: string;
}

let transporter: nodemailer.Transporter | null = null;

function isConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_HOST.trim());
}

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASSWORD
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
          }
        : undefined,
  });

  return transporter;
}

export async function sendMail(input: MailInput): Promise<void> {
  const from = process.env.SMTP_FROM ?? "OpenHRM <no-reply@openhrm.local>";

  if (!isConfigured()) {
    console.info(
      [
        "",
        "┌─ email (not sent — SMTP_HOST is unset) ───────────────────────────",
        `│ To:      ${input.to}`,
        `│ Subject: ${input.subject}`,
        "│",
        ...input.text.split("\n").map((line) => `│ ${line}`),
        "└───────────────────────────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
    return;
  }

  try {
    await getTransporter().sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
  } catch (error) {
    // A failed notification email must not roll back the action that triggered
    // it — the leave request was still approved.
    console.error("[mail] delivery failed", { to: input.to, error });
  }
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function layout(heading: string, body: string, cta?: { label: string; url: string }) {
  return `<!doctype html>
<html><body style="margin:0;background:#f8fafc;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;color:#0f172a">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px">
    <div style="font-size:13px;font-weight:600;letter-spacing:.02em;color:#2563eb;margin-bottom:24px">OpenHRM</div>
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:32px">
      <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;letter-spacing:-.01em">${heading}</h1>
      <div style="font-size:14px;line-height:1.6;color:#475569">${body}</div>
      ${
        cta
          ? `<a href="${cta.url}" style="display:inline-block;margin-top:24px;background:#2563eb;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:500">${cta.label}</a>
             <p style="margin-top:20px;font-size:12px;color:#94a3b8;word-break:break-all">Or paste this link into your browser:<br>${cta.url}</p>`
          : ""
      }
    </div>
  </div>
</body></html>`;
}

export async function sendInvitationEmail(params: {
  to: string;
  orgName: string;
  inviterName: string;
  roleName: string;
  acceptUrl: string;
}): Promise<void> {
  const { to, orgName, inviterName, roleName, acceptUrl } = params;

  await sendMail({
    to,
    subject: `${inviterName} invited you to ${orgName} on OpenHRM`,
    text: [
      `${inviterName} has invited you to join ${orgName} on OpenHRM as ${roleName}.`,
      "",
      "Set your password and get started:",
      acceptUrl,
      "",
      "This invitation expires in 7 days.",
    ].join("\n"),
    html: layout(
      `Join ${orgName}`,
      `<p style="margin:0"><strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> on OpenHRM as <strong>${roleName}</strong>.</p>
       <p style="margin:12px 0 0">This invitation expires in 7 days.</p>`,
      { label: "Accept invitation", url: acceptUrl },
    ),
  });
}

export async function sendLeaveDecisionEmail(params: {
  to: string;
  employeeName: string;
  approverName: string;
  leaveType: string;
  dateRange: string;
  approved: boolean;
  note?: string | null;
  url: string;
}): Promise<void> {
  const { to, approverName, leaveType, dateRange, approved, note, url } = params;
  const verdict = approved ? "approved" : "declined";

  await sendMail({
    to,
    subject: `Your ${leaveType} request was ${verdict}`,
    text: [
      `${approverName} ${verdict} your ${leaveType} request for ${dateRange}.`,
      note ? `\nNote: ${note}` : "",
      "",
      url,
    ].join("\n"),
    html: layout(
      `Leave ${verdict}`,
      `<p style="margin:0"><strong>${approverName}</strong> ${verdict} your <strong>${leaveType}</strong> request for <strong>${dateRange}</strong>.</p>
       ${note ? `<p style="margin:12px 0 0;padding:12px;background:#f8fafc;border-radius:8px">${note}</p>` : ""}`,
      { label: "View request", url },
    ),
  });
}

export async function sendApprovalRequestEmail(params: {
  to: string;
  requesterName: string;
  what: string;
  detail: string;
  url: string;
}): Promise<void> {
  const { to, requesterName, what, detail, url } = params;

  await sendMail({
    to,
    subject: `${requesterName} requested ${what}`,
    text: [`${requesterName} requested ${what}.`, detail, "", url].join("\n"),
    html: layout(
      "Waiting on you",
      `<p style="margin:0"><strong>${requesterName}</strong> requested ${what}.</p>
       <p style="margin:12px 0 0;color:#0f172a">${detail}</p>`,
      { label: "Review request", url },
    ),
  });
}
