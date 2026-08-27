const { sendError } = require("../utils/response");

/**
 * Joi validation as middleware.
 *
 * Two things matter beyond convenience:
 *
 *   - `stripUnknown` means only declared fields ever reach a service. Handlers
 *     that spread request data into a Prisma call cannot be fed an extra field
 *     (`role`, `published`, `authorId`) that the schema never intended to
 *     accept — mass assignment stops being possible by construction.
 *
 *   - Replacing the source object with the validated value means downstream code
 *     reads coerced, bounded data rather than raw input.
 */
const validate = (schema, source = "body") => (req, res, next) => {
  const { error, value } = schema.validate(req[source], {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });

  if (error) {
    return sendError(
      res,
      400,
      "Validation failed",
      error.details.map((d) => d.message)
    );
  }

  // req.query and req.params are getter-only on Express 5; assigning to a
  // property of the existing object keeps both versions working.
  if (source === "body") req.body = value;
  else req.validated = { ...(req.validated || {}), [source]: value };

  next();
};

/** Reads a validated value regardless of which source it came from. */
const validated = (req, source) => (source === "body" ? req.body : req.validated?.[source]);

module.exports = { validate, validated };
