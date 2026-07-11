// branded, email-client-safe HTML template (table layout + inline styles).
// User-supplied values must be escaped BEFORE being passed in as HTML

const BRAND = "#ef233c";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const button = (label, url) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;">
    <tr><td style="border-radius:9999px;background:${BRAND};">
      <a href="${url}" target="_blank"
         style="display:inline-block;padding:13px 30px;font-family:${FONT};font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:9999px;">${label}</a>
    </td></tr>
  </table>`;

/**
 * @param {object}  opts
 * @param {string}  opts.preheader  Hidden inbox-preview text.
 * @param {string}  opts.heading    Escaped heading text.
 * @param {string}  opts.bodyHtml   Escaped/trusted body HTML.
 * @param {{label:string,url:string}} [opts.cta]
 * @param {string}  [opts.footerNote] Extra footer HTML (e.g. unsubscribe line).
 */
const renderEmail = ({ preheader = "", heading, bodyHtml = "", cta, footerNote = "" }) => {
  const year = new Date().getFullYear();
  const ctaHtml = cta ? button(cta.label, cta.url) : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:#f4f4f5;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f4f4f5;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f5;">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e6e6e8;border-radius:16px;overflow:hidden;">
    <tr><td style="padding:28px 32px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="width:16px;height:16px;background:${BRAND};border-radius:5px;font-size:0;line-height:0;">&nbsp;</td>
        <td style="padding-left:11px;font-family:${FONT};font-size:18px;font-weight:800;color:#0a0a0a;letter-spacing:-0.02em;">Scriptory</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:22px 32px 4px;font-family:${FONT};color:#1a1a1a;">
      <h1 style="margin:0 0 14px;font-size:21px;line-height:1.35;font-weight:700;color:#0a0a0a;">${heading}</h1>
      <div style="font-size:15px;line-height:1.65;color:#3f3f46;">${bodyHtml}</div>
      ${ctaHtml}
    </td></tr>
    <tr><td style="padding:22px 32px 26px;">
      <div style="border-top:1px solid #eeeeef;padding-top:18px;font-family:${FONT};font-size:12px;line-height:1.6;color:#9a9aa2;">
        ${footerNote ? `<p style="margin:0 0 8px;">${footerNote}</p>` : ""}
        <p style="margin:0;">&copy; ${year} Scriptory &middot; Backend engineering, from the trenches.</p>
      </div>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
};

module.exports = { renderEmail };
