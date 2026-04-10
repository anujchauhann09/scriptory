const { PrismaClient } = require("@prisma/client");
const logger = require("../utils/logger");

const prisma = new PrismaClient({
  log: [
    { emit: "event", level: "query" },
    { emit: "event", level: "error" },
    { emit: "event", level: "warn" },
  ],
});

// Log slow queries in development
if (process.env.NODE_ENV === "development") {
  prisma.$on("query", (e) => {
    if (e.duration > 200) {
      logger.warn(`Slow query (${e.duration}ms): ${e.query}`);
    }
  });
}

prisma.$on("error", (e) => {
  logger.error("Prisma error:", e);
});

module.exports = prisma;
