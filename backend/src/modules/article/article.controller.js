const articleService = require("./article.service");
const { createArticleSchema, updateArticleSchema, listArticlesSchema } = require("./article.validation");
const { sendSuccess, sendError } = require("../../utils/response");
const { logAudit } = require("../../utils/audit");

const listArticles = async (req, res, next) => {
  try {
    const { error, value } = listArticlesSchema.validate(req.query, { abortEarly: false });
    if (error) {
      return sendError(res, 400, "Validation failed", error.details.map((d) => d.message));
    }
    if (!req.user || req.user.role !== "ADMIN") {
      value.published = true;
    }
    const result = await articleService.listArticles(value);
    return sendSuccess(res, 200, "Articles fetched", result);
  } catch (err) {
    next(err);
  }
};

const getArticle = async (req, res, next) => {
  try {
    const article = await articleService.getArticleBySlug(req.params.slug);
    return sendSuccess(res, 200, "Article fetched", article);
  } catch (err) {
    next(err);
  }
};

const createArticle = async (req, res, next) => {
  try {
    const { error, value } = createArticleSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return sendError(res, 400, "Validation failed", error.details.map((d) => d.message));
    }
    const article = await articleService.createArticle(req.user.uuid, value);
    logAudit("article.create", { actorUuid: req.user.uuid, actorEmail: req.user.email, ip: req.ip, detail: article.title });
    return sendSuccess(res, 201, "Article created", article);
  } catch (err) {
    next(err);
  }
};

const updateArticle = async (req, res, next) => {
  try {
    const { error, value } = updateArticleSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return sendError(res, 400, "Validation failed", error.details.map((d) => d.message));
    }
    const article = await articleService.updateArticleByUuid(req.params.uuid, value);
    logAudit("article.update", { actorUuid: req.user.uuid, actorEmail: req.user.email, ip: req.ip, detail: article.title });
    return sendSuccess(res, 200, "Article updated", article);
  } catch (err) {
    next(err);
  }
};

const deleteArticle = async (req, res, next) => {
  try {
    await articleService.deleteArticleByUuid(req.params.uuid);
    logAudit("article.delete", { actorUuid: req.user.uuid, actorEmail: req.user.email, ip: req.ip, detail: req.params.uuid });
    return sendSuccess(res, 200, "Article deleted");
  } catch (err) {
    next(err);
  }
};

module.exports = { listArticles, getArticle, createArticle, updateArticleByUuid: updateArticle, deleteArticleByUuid: deleteArticle };
