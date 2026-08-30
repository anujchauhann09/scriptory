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

/**
 * Whether an email carrying an unsubscribe link may be sent at all.
 *
 * Only false during first-deploy bootstrap, when the platform has not yet
 * minted the service URL. Refusing is the correct behaviour rather than an
 * inconvenience: an unsubscribe link is not decoration, and a bulk email that
 * carries a broken one is worse than no email — it cannot be opted out of, and
 * in most jurisdictions that is the part that is actually required.
 */
const canBuildUnsubscribeLinks = () => Boolean(config.apiUrl);

const sendWelcome = (subscriber) => {
  if (!canBuildUnsubscribeLinks()) {
    // The subscriber is still recorded; only the email is withheld, so nothing
    // is lost and the welcome can be re-sent once API_URL is set.
    logger.warn("Welcome email withheld: API_URL is not set yet", {
      reason: "api-url-pending",
    });
    return;
  }
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

// Broadcast recent posts to every active subscriber. Called by the weekly cron
// and by the admin "Send digest" action.
const sendDigest = async ({ sinceDays = 7, max = 8 } = {}) => {
  if (!canBuildUnsubscribeLinks()) {
    logger.error("Digest refused: API_URL is not set, so no unsubscribe link can be built", {
      reason: "api-url-pending",
    });
    return {
      sent: 0,
      total: 0,
      skipped: true,
      message: "Digest not sent: API_URL is not configured, so unsubscribe links cannot be built.",
    };
  }

  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const articles = await prisma.article.findMany({
    // Never broadcast something that has been retired, even if it was published
    // inside the window and archived shortly after.
    where: { published: true, archivedAt: null, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: max,
    select: { title: true, slug: true, excerpt: true },
  });
  if (articles.length === 0) return { sent: 0, total: 0, message: "No new posts in the window" };

  const subs = await prisma.subscriber.findMany({
    where: { status: "SUBSCRIBED" },
    select: { email: true, unsubscribeToken: true },
  });
  if (subs.length === 0) return { sent: 0, total: 0, message: "No active subscribers" };

  const listHtml = articles
    .map(
      (a) =>
        `<p style="margin:0 0 16px">
          <a href="${config.frontendUrl}/articles/${a.slug}" style="color:#0a0a0a;font-weight:700;font-size:17px;text-decoration:none">${escapeHtml(a.title)}</a>
          <br/><span style="color:#71717a;font-size:14px">${escapeHtml(a.excerpt || "")}</span>
        </p>`
    )
    .join("");
  const textList = articles.map((a) => `• ${a.title}\n  ${config.frontendUrl}/articles/${a.slug}`).join("\n\n");

  /**
   * Delivery is batched with a bounded deadline.
   *
   * Two constraints shape this. A request-scoped platform kills the handler at
   * its request timeout, so a strictly sequential send over a large list would
   * be cut off partway with no record of where it stopped — and the retry would
   * re-mail everyone it already reached. And an SMTP provider will start
   * refusing connections if all of them are opened at once.
   *
   * So: a small concurrency window to keep the provider happy, and a deadline
   * that stops cleanly and reports how far it got, rather than being killed
   * mid-flight.
   */
  const concurrency = Number(process.env.DIGEST_CONCURRENCY) || 5;
  const deadline = Date.now() + (Number(process.env.DIGEST_DEADLINE_MS) || 4 * 60 * 1000);

  const sendTo = async (sub) => {
    const unsubscribeUrl = `${config.apiUrl}/api/newsletter/unsubscribe?token=${sub.unsubscribeToken}`;
    const result = await sendMail({
      to: sub.email,
      subject: `Fresh from Scriptory — ${articles.length} new post${articles.length === 1 ? "" : "s"}`,
      text: `New on Scriptory:\n\n${textList}\n\nUnsubscribe: ${unsubscribeUrl}`,
      html: renderEmail({
        preheader: `${articles.length} new post${articles.length === 1 ? "" : "s"} on Scriptory`,
        heading: "Fresh from Scriptory",
        bodyHtml: `<p style="margin:0 0 18px">Here's what's new since last time:</p>${listHtml}`,
        cta: { label: "Read on Scriptory", url: `${config.frontendUrl}/articles` },
        footerNote: `You're receiving this because you subscribed at Scriptory. <a href="${unsubscribeUrl}" style="color:#9a9aa2;text-decoration:underline;">Unsubscribe</a>.`,
      }),
    });
    return Boolean(result.sent);
  };

  let sent = 0;
  let attempted = 0;
  let timedOut = false;

  for (let i = 0; i < subs.length; i += concurrency) {
    if (Date.now() > deadline) {
      timedOut = true;
      break;
    }
    const batch = subs.slice(i, i + concurrency);
    attempted += batch.length;
    // sendMail already swallows its own failures, but a rejection here must not
    // abandon the remaining batches either.
    const results = await Promise.allSettled(batch.map(sendTo));
    sent += results.filter((r) => r.status === "fulfilled" && r.value).length;
  }

  if (timedOut) {
    logger.warn("Digest stopped at its deadline", { sent, attempted, total: subs.length });
  }

  return {
    sent,
    attempted,
    total: subs.length,
    incomplete: timedOut,
    message: timedOut
      ? `Digest stopped at its time limit after ${sent}/${subs.length} subscribers`
      : `Digest sent to ${sent}/${subs.length} subscribers`,
  };
};

const listSubscribers = async () =>
  prisma.subscriber.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { uuid: true, email: true, status: true, createdAt: true },
  });

module.exports = { subscribe, unsubscribe, findByToken, listSubscribers, deleteSubscriber, sendDigest };
