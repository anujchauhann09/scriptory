const contactService = require("./contact.service");
const { contactSchema } = require("./contact.validation");
const { sendSuccess, sendError } = require("../../utils/response");

const submit = async (req, res, next) => {
  try {
    const { error, value } = contactSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return sendError(res, 400, "Validation failed", error.details.map((d) => d.message));
    }

    // Honeypot tripped — pretend success, drop silently.
    if (value.company) {
      return sendSuccess(res, 201, "Message sent");
    }

    const result = await contactService.createMessage(
      { name: value.name, email: value.email, message: value.message },
      { ip: req.ip, userAgent: req.headers["user-agent"] }
    );

    return sendSuccess(res, 201, "Message sent", result);
  } catch (err) {
    next(err);
  }
};

const list = async (req, res, next) => {
  try {
    const messages = await contactService.listMessages();
    return sendSuccess(res, 200, "Contact messages fetched", messages);
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const { handled } = req.body;
    if (typeof handled !== "boolean") {
      return sendError(res, 400, "`handled` must be a boolean");
    }
    const result = await contactService.setHandled(req.params.uuid, handled);
    return sendSuccess(res, 200, "Message updated", result);
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    await contactService.deleteMessage(req.params.uuid);
    return sendSuccess(res, 200, "Message deleted");
  } catch (err) {
    next(err);
  }
};

module.exports = { submit, list, update, remove };
