const prisma = require("../../config/db");
const config = require("../../config/env");
const { sendMail } = require("../../config/mailer");
const { renderEmail } = require("../../utils/emailTemplate");
const logger = require("../../utils/logger");

const normalizeEmail = (email) => email.trim().toLowerCase();

const escapeHtml = (str = "") =>
  str.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

const sendWelcome = (subscriber) => {
  const unsubscribeUrl = `${config.apiUrl}/api/newsletter/unsubscribe?token=${subscriber.unsubscribeToken}`;
  const articlesUrl = `${config.frontendUrl}/articles`;
  sendMail({
    to: subscriber.email,
    subject: "Welcome to Scriptory",
    text:
      `Welcome to Scriptory!\n\n` +
      `Thanks for subscribing. You'll get new articles on backend engineering, system design, distributed systems, and real production war stories — delivered only when there's something worth reading. No spam, ever.\n\n` +
      `Start reading: ${articlesUrl}\n\n` +
      `— Anuj Chauhan, Scriptory\n\n` +
      `You're receiving this because you subscribed at Scriptory. Unsubscribe anytime: ${unsubscribeUrl}`,
    html: renderEmail({
      preheader: "Thanks for subscribing — here's what to expect.",
      heading: "Welcome to Scriptory.",
      bodyHtml: `
        <p style="margin:0 0 14px;">Thanks for subscribing. You'll get new articles on backend engineering, system design, distributed systems, and real production war stories &mdash; delivered only when there's something genuinely worth reading.</p>
        <p style="margin:0;"><strong>No spam, ever.</strong></p>`,
      cta: { label: "Start reading", url: articlesUrl },
      footerNote: `You're receiving this because you subscribed at Scriptory. <a href="${unsubscribeUrl}" style="color:#9a9aa2;text-decoration:underline;">Unsubscribe</a> anytime.`,
    }),
  }).catch((err) => logger.error(`Welcome email failed: ${err.message}`));
};

const subscribe = async (rawEmail) => {
  const email = normalizeEmail(rawEmail);
  const existing = await prisma.subscriber.findUnique({ where: { email } });

  if (existing) {
    if (existing.status === "SUBSCRIBED") {
      return { status: "already" };
    }
    // reactivate a previously unsubscribed address
    const reactivated = await prisma.subscriber.update({
      where: { email },
      data: { status: "SUBSCRIBED", unsubscribedAt: null },
      select: { email: true, unsubscribeToken: true },
    });
    sendWelcome(reactivated);
    return { status: "resubscribed" };
  }

  const created = await prisma.subscriber.create({
    data: { email },
    select: { email: true, unsubscribeToken: true },
  });
  sendWelcome(created);

  if (config.contactRecipient) {
    sendMail({
      to: config.contactRecipient,
      subject: "New newsletter subscriber — Scriptory",
      text: `New newsletter subscriber: ${email}`,
      html: renderEmail({
        preheader: `New subscriber: ${email}`,
        heading: "New newsletter subscriber",
        bodyHtml: `<p style="margin:0;">A new reader just subscribed to the Scriptory newsletter:</p>
          <p style="margin:12px 0 0;font-size:16px;"><strong>${escapeHtml(email)}</strong></p>`,
      }),
    }).catch((err) => logger.error(`Subscriber notify failed: ${err.message}`));
  }

  return { status: "subscribed" };
};

// read-only lookup used to render the unsubscribe confirmation page.
const findByToken = async (token) => {
  if (!token) return null;
  return prisma.subscriber.findUnique({
    where: { unsubscribeToken: token },
    select: { email: true, status: true },
  });
};

const unsubscribe = async (token) => {
  if (!token) {
    const err = new Error("Missing unsubscribe token");
    err.statusCode = 400;
    throw err;
  }
  const subscriber = await prisma.subscriber.findUnique({ where: { unsubscribeToken: token } });
  if (!subscriber) {
    const err = new Error("Invalid or expired unsubscribe link");
    err.statusCode = 404;
    throw err;
  }
  if (subscriber.status === "UNSUBSCRIBED") {
    return { email: subscriber.email, alreadyUnsubscribed: true };
  }
  await prisma.subscriber.update({
    where: { id: subscriber.id },
    data: { status: "UNSUBSCRIBED", unsubscribedAt: new Date() },
  });
  return { email: subscriber.email, alreadyUnsubscribed: false };
};

const deleteSubscriber = async (uuid) => {
  await prisma.subscriber.delete({ where: { uuid } });
};

const listSubscribers = async () =>
  prisma.subscriber.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { uuid: true, email: true, status: true, createdAt: true },
  });

module.exports = { subscribe, unsubscribe, findByToken, listSubscribers, deleteSubscriber };
