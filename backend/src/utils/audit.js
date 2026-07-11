const prisma = require("../config/db");
const logger = require("./logger");


const logAudit = (action, { actorUuid, actorEmail, ip, detail } = {}) => {
  prisma.auditLog
    .create({
      data: {
        action,
        actorUuid: actorUuid || null,
        actorEmail: actorEmail || null,
        ip: ip || null,
        detail: detail ? String(detail).slice(0, 500) : null,
      },
    })
    .catch((err) => logger.error(`Audit log failed for "${action}": ${err.message}`));
};

const listAudit = async (limit = 200) =>
  prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      uuid: true,
      action: true,
      actorEmail: true,
      ip: true,
      detail: true,
      createdAt: true,
    },
  });

module.exports = { logAudit, listAudit };
