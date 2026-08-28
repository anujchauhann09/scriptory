const newsletterService = require("./newsletter.service");
const tasks = require("../internal/internal.tasks");
const { sendSuccess } = require("../../utils/response");

const MESSAGES = {
  subscribed: "Subscribed successfully!",
  resubscribed: "Welcome back — you're subscribed again!",
  already: "You're already subscribed.",
};

const escapeHtml = (str = "") =>
  str.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

/**
 * Sends one of the small unsubscribe pages.
 *
 * `no-store` matters here: the URL carries a capability token, and a shared
 * cache or a browser back-button restore holding that page is a way for the
 * token to outlive the click that used it.
 */
const sendPage = (res, status, html) =>
  res
    .status(status)
    .set("Content-Type", "text/html; charset=utf-8")
    .set("Cache-Control", "no-store")
    .set("Referrer-Policy", "no-referrer")
    .send(html);

// minimal, self-contained (no external assets) HTML page for unsubscribe flows
const page = ({ heading, body, form }) => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Unsubscribe — Scriptory</title></head>
<body style="font-family:sans-serif;background:#0a0a0a;color:#fafafa;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
<div style="text-align:center;padding:2rem;max-width:420px">
<div style="width:16px;height:16px;background:#ef233c;border-radius:4px;transform:rotate(45deg);margin:0 auto 1.5rem"></div>
<h1 style="margin:0 0 .5rem;font-size:1.5rem">${heading}</h1>
<p style="color:#a3a3a3;margin:0 0 1.5rem">${body}</p>
${form || ""}
</div></body></html>`;

const subscribe = async (req, res, next) => {
  try {
    const value = req.body;

    // honeypot tripped — pretend success, drop silently.
    if (value.company) {
      return sendSuccess(res, 201, MESSAGES.subscribed, { status: "subscribed" });
    }

    const result = await newsletterService.subscribe(value.email);
    return sendSuccess(res, 201, MESSAGES[result.status] || MESSAGES.subscribed, result);
  } catch (err) {
    next(err);
  }
};

// GET: read-only confirmation page. Does NOT change state, so email-client
// link prefetching / scanners can't accidentally unsubscribe anyone
const unsubscribeConfirm = async (req, res, next) => {
  try {
    // Bounded at the boundary: the token is a uuid, so anything longer is
    // malformed and should never be carried into a query or echoed into a page.
    const token = String(req.query.token || "").slice(0, 200);
    const subscriber = await newsletterService.findByToken(token);

    if (!subscriber) {
      return sendPage(
        res,
        404,
        page({
          heading: "Invalid unsubscribe link",
          body: "This link is invalid or has expired.",
        })
      );
    }
    if (subscriber.status === "UNSUBSCRIBED") {
      return sendPage(
        res,
        200,
        page({
          heading: "You're already unsubscribed",
          body: `${escapeHtml(subscriber.email)} is not receiving Scriptory emails.`,
        })
      );
    }
    return sendPage(
      res,
      200,
      page({
        heading: "Unsubscribe from Scriptory?",
        body: `Confirm to stop sending emails to ${escapeHtml(subscriber.email)}.`,
        form: `<form method="POST" action="/api/newsletter/unsubscribe">
          <input type="hidden" name="token" value="${escapeHtml(token)}">
          <button type="submit" style="cursor:pointer;background:#ef233c;color:#fff;border:0;border-radius:9999px;padding:.75rem 1.75rem;font-size:1rem;font-weight:600">Confirm unsubscribe</button>
        </form>`,
      })
    );
  } catch (err) {
    next(err);
  }
};

// POST: performs the state change. The unguessable token in the body is the
// capability
const unsubscribe = async (req, res, next) => {
  try {
    const token = String(req.body.token || req.query.token || "").slice(0, 200);
    const result = await newsletterService.unsubscribe(token);
    const heading = result.alreadyUnsubscribed
      ? "You're already unsubscribed"
      : "You've been unsubscribed";
    return sendPage(
      res,
      200,
      page({
        heading,
        body: `${escapeHtml(result.email)} will no longer receive Scriptory emails.`,
      })
    );
  } catch (err) {
    next(err);
  }
};

const list = async (req, res, next) => {
  try {
    const subscribers = await newsletterService.listSubscribers();
    return sendSuccess(res, 200, "Subscribers fetched", subscribers);
  } catch (err) {
    next(err);
  }
};

/**
 * Admin "Send digest".
 *
 * Routed through the same lease as the scheduled run, so a manual send can
 * never overlap the cron and double-mail every subscriber.
 *
 * It passes no run key on purpose: the admin is explicitly asking to send now,
 * and that intent should not be silently swallowed by a key saying "this week
 * already went out". Mutual exclusion still applies; only the replay check is
 * skipped.
 */
const digest = async (req, res, next) => {
  try {
    const result = await tasks.sendNewsletterDigest({ runKey: null });

    if (result.skipped) {
      return sendSuccess(
        res,
        200,
        "A digest send is already in progress. Nothing was sent twice.",
        result
      );
    }
    return sendSuccess(res, 200, result.message, result);
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    await newsletterService.deleteSubscriber(req.params.uuid);
    return sendSuccess(res, 200, "Subscriber deleted");
  } catch (err) {
    next(err);
  }
};

module.exports = { subscribe, unsubscribeConfirm, unsubscribe, list, remove, digest };
