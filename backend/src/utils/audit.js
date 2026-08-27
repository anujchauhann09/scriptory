const prisma = require("../config/db");
const logger = require("./logger");

/**
 * Append-only record of security-relevant actions.
 *
 * Deliberately fire-and-forget: an audit write must never fail the operation it
 * is describing, and must never add latency to it. A failure is logged instead
 * of thrown.
 *
 * What goes in here is a decision, not an afterthought. Actor identity, source
 * address and a short description are what an incident reconstruction needs.
 * Credentials, tokens, TOTP codes and request bodies are not — recording those
 * would turn an audit table that admins read through the API into a secondary
 * store of secrets, so callers pass a description and never raw input.
 */
const MAX_DETAIL_LENGTH = 500;

// Control characters are stripped so a crafted value cannot forge extra lines
// when the record is rendered in a terminal or an admin dashboard.
const CONTROL_CHARS = /\p{Cc}+/gu;

const logAudit = (action, { actorUuid, actorEmail, ip, detail } = {}) => {
  prisma.auditLog
    .create({
      data: {
        action,
        actorUuid: actorUuid || null,
        actorEmail: actorEmail || null,
        ip: ip || null,
        detail: detail
          ? String(detail).replace(CONTROL_CHARS, " ").slice(0, MAX_DETAIL_LENGTH)
          : null,
      },
    })
    .catch((err) => logger.error("Audit log write failed", { action, message: err.message }));
};

const listAudit = async ({ limit = 200, action } = {}) =>
  prisma.auditLog.findMany({
    where: action ? { action } : undefined,
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 500),
    select: {
      uuid: true,
      action: true,
      actorEmail: true,
      ip: true,
      detail: true,
      createdAt: true,
    },
  });

/** Trims records past the retention window. Run from the maintenance task. */
const pruneAudit = async (retentionDays = Number(process.env.AUDIT_RETENTION_DAYS) || 180) => {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const { count } = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return count;
};

module.exports = { logAudit, listAudit, pruneAudit };
