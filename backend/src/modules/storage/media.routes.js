const { Router } = require("express");
const storageService = require("./storage.service");

const router = Router();

router.get("/:token", async (req, res, next) => {
  try {
    const media = await storageService.readByToken(req.params.token);
    res.set({
      "Content-Type": media.contentType,
      "Cache-Control": media.cacheControl,
      "X-Content-Type-Options": "nosniff",
      // Media is intentionally read from the API origin by the Vercel-hosted SPA.
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
    media.stream.on("error", next);
    media.stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
