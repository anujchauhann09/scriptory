const nodemailer = require("nodemailer");
const config = require("./env");
const logger = require("../utils/logger");

let transporter = null;

const isConfigured = Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);

if (isConfigured) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });
} else {
  logger.warn(
    "SMTP is not configured — emails will be logged and skipped. Set SMTP_HOST/SMTP_USER/SMTP_PASS to enable delivery."
  );
}


const sendMail = async ({ to, subject, html, text, replyTo }) => {
  if (!isConfigured) {
    logger.info(`[mail skipped] to=${to} subject="${subject}"`);
    return { sent: false, skipped: true };
  }
  try {
    const info = await transporter.sendMail({
      from: config.smtp.from,
      to,
      subject,
      html,
      text,
      replyTo,
    });
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    logger.error(`Failed to send email to ${to}: ${err.message}`);
    return { sent: false, error: err.message };
  }
};

module.exports = { sendMail, isConfigured };
