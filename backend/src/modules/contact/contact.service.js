const crypto = require("crypto");
const prisma = require("../../config/db");
const config = require("../../config/env");
const { sendMail } = require("../../config/mailer");
const { renderEmail } = require("../../utils/emailTemplate");
const logger = require("../../utils/logger");

/**
 * Keyed hash of the submitter's IP, kept for abuse triage.
 *
 * A plain SHA-256 of an IP address is not anonymisation: the whole IPv4 space
 * can be enumerated in seconds, so the digest reverses trivially. Keying it
 * with a server secret makes the stored value useless to anyone who obtains a
 * database dump without also holding the key.
 */
const hash = (value) =>
  value
    ? crypto.createHmac("sha256", config.jwtSecret).update(value).digest("hex").slice(0, 32)
    : null;

const escapeHtml = (str = "") =>
  str.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

// Strip CR/LF and control chars so user input can't inject email headers (Subject, etc.)
const sanitizeHeader = (str = "") =>
  str.replace(/[\u0000-\u001F\u007F]+/g, " ").trim().slice(0, 200);

const createMessage = async ({ name, email, message }, meta = {}) => {
  const record = await prisma.contactMessage.create({
    data: {
      name,
      email,
      message,
      ipHash: hash(meta.ip),
      userAgent: meta.userAgent ? meta.userAgent.slice(0, 255) : null,
    },
    select: { uuid: true, createdAt: true },
  });

  // notify the site owner (fire-and-forget; never blocks the response outcome)
  const headerName = sanitizeHeader(name);
  const firstName = sanitizeHeader(name).split(" ")[0] || "there";
  const safeName = escapeHtml(name);
  const safeFirstName = escapeHtml(firstName);
  const safeEmail = escapeHtml(email);
  const safeMessageBlock = escapeHtml(message).replace(/\n/g, "<br/>");

  if (config.contactRecipient) {
    sendMail({
      to: config.contactRecipient,
      replyTo: email,
      subject: `New contact message from ${headerName}`,
      text:
        `New contact message via Scriptory\n\n` +
        `Name:  ${name}\nEmail: ${email}\n\n` +
        `Message:\n${message}\n\n` +
        `Reply directly to this email to respond to ${firstName}.`,
      html: renderEmail({
        preheader: `New message from ${headerName}`,
        heading: "New contact message",
        bodyHtml: `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 16px;font-size:14px;">
            <tr><td style="padding:4px 0;color:#71717a;width:70px;">Name</td><td style="padding:4px 0;color:#0a0a0a;font-weight:600;">${safeName}</td></tr>
            <tr><td style="padding:4px 0;color:#71717a;">Email</td><td style="padding:4px 0;"><a href="mailto:${safeEmail}" style="color:#ef233c;text-decoration:none;">${safeEmail}</a></td></tr>
          </table>
          <div style="padding:16px 18px;background:#f7f7f8;border-left:3px solid #ef233c;border-radius:8px;color:#27272a;">${safeMessageBlock}</div>`,
        footerNote: `Reply directly to this email to respond to ${safeFirstName}.`,
      }),
    }).catch((err) => logger.error(`Contact notify email failed: ${err.message}`));
  }

  // auto-acknowledge the sender
  sendMail({
    to: email,
    subject: "We received your message — Scriptory",
    text:
      `Hi ${firstName},\n\n` +
      `Thanks for reaching out through Scriptory. Your message has been received and I'll get back to you personally, usually within a couple of days.\n\n` +
      `For your reference, here's what you sent:\n"${message}"\n\n` +
      `Best,\nAnuj Chauhan\nScriptory\n\n` +
      `This is an automated confirmation — there's no need to reply.`,
    html: renderEmail({
      preheader: "Thanks for reaching out — I'll be in touch soon.",
      heading: `Thanks for reaching out, ${safeFirstName}.`,
      bodyHtml: `
        <p style="margin:0 0 14px;">Your message has been received and I'll get back to you personally, usually within a couple of days.</p>
        <p style="margin:0 0 8px;color:#71717a;font-size:13px;">For your reference, here's what you sent:</p>
        <div style="padding:14px 18px;background:#f7f7f8;border-left:3px solid #ef233c;border-radius:8px;color:#27272a;">${safeMessageBlock}</div>
        <p style="margin:18px 0 0;">Best,<br/><strong>Anuj Chauhan</strong><br/><span style="color:#71717a;">Scriptory</span></p>`,
      footerNote: "This is an automated confirmation — there's no need to reply to this email.",
    }),
  }).catch((err) => logger.error(`Contact auto-reply failed: ${err.message}`));

  return record;
};

const setHandled = async (uuid, handled) => {
  await prisma.contactMessage.update({ where: { uuid }, data: { handled } });
  return { uuid, handled };
};

const deleteMessage = async (uuid) => {
  await prisma.contactMessage.delete({ where: { uuid } });
};

const listMessages = async () =>
  prisma.contactMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      uuid: true,
      name: true,
      email: true,
      message: true,
      handled: true,
      createdAt: true,
    },
  });

module.exports = { createMessage, listMessages, setHandled, deleteMessage };
