const newsletterService = require("./newsletter.service");
const { subscribeSchema } = require("./newsletter.validation");
const { sendSuccess, sendError } = require("../../utils/response");

const MESSAGES = {
  subscribed: "Subscribed successfully!",
  resubscribed: "Welcome back — you're subscribed again!",
  already: "You're already subscribed.",
};

const escapeHtml = (str = "") =>
  str.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

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
    const { error, value } = subscribeSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return sendError(res, 400, "Validation failed", error.details.map((d) => d.message));
    }

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
    const token = String(req.query.token || "");
    const subscriber = await newsletterService.findByToken(token);

    if (!subscriber) {
      return res.status(404).send(
        page({
          heading: "Invalid unsubscribe link",
          body: "This link is invalid or has expired.",
        })
      );
    }
    if (subscriber.status === "UNSUBSCRIBED") {
      return res.status(200).send(
        page({
          heading: "You're already unsubscribed",
          body: `${escapeHtml(subscriber.email)} is not receiving Scriptory emails.`,
        })
      );
    }
    return res.status(200).send(
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
    const token = String(req.body.token || req.query.token || "");
    const result = await newsletterService.unsubscribe(token);
    const heading = result.alreadyUnsubscribed
      ? "You're already unsubscribed"
      : "You've been unsubscribed";
    return res.status(200).send(
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

const remove = async (req, res, next) => {
  try {
    await newsletterService.deleteSubscriber(req.params.uuid);
    return sendSuccess(res, 200, "Subscriber deleted");
  } catch (err) {
    next(err);
  }
};

module.exports = { subscribe, unsubscribeConfirm, unsubscribe, list, remove };
