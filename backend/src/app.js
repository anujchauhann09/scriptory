const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");

const config = require("./config/env");
const errorMiddleware = require("./middleware/error.middleware");
const logger = require("./utils/logger");

const authRoutes = require("./modules/auth/auth.routes");
const userRoutes = require("./modules/user/user.routes");
const articleRoutes = require("./modules/article/article.routes");
const tagRoutes = require("./modules/tag/tag.routes");
const viewRoutes = require("./modules/view/view.routes");
const commentRoutes = require("./modules/comment/comment.routes");
const uploadRoutes = require("./modules/upload/upload.routes");
const likeRoutes = require("./modules/like/like.routes");
const contactRoutes = require("./modules/contact/contact.routes");
const newsletterRoutes = require("./modules/newsletter/newsletter.routes");
const auditRoutes = require("./modules/audit/audit.routes");

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
  })
);

app.set("trust proxy", 1);

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 50 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, please try again later." },
});
app.use("/api", limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 20 : 100,
  message: { success: false, message: "Too many auth attempts, please try again later." },
});
app.use("/api/auth", authLimiter);

// tighter limit for public write endpoints (contact + newsletter) to curb spam
const publicWriteLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 5 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method !== "POST",
  message: { success: false, message: "Too many submissions, please try again later." },
});
app.use("/api/contact", publicWriteLimiter);
app.use("/api/newsletter/subscribe", publicWriteLimiter);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

if (config.nodeEnv !== "test") {
  app.use(
    morgan("combined", {
      stream: { write: (msg) => logger.info(msg.trim()) },
    })
  );
}

app.get("/health", (req, res) => {
  res.json({ success: true, message: "Scriptory API is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/articles", articleRoutes);
app.use("/api/articles", viewRoutes);                          
app.use("/api/articles", likeRoutes);                          
app.use("/api/articles/:articleId/comments", commentRoutes);  
app.use("/api/tags", tagRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/newsletter", newsletterRoutes);
app.use("/api/audit", auditRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: "The requested resource was not found." });
});

app.use(errorMiddleware);

module.exports = app;
