const contactService = require("./contact.service");
const { sendSuccess, sendError } = require("../../utils/response");

const submit = async (req, res, next) => {
  try {
    const value = req.body;

    // Honeypot tripped — pretend success, drop silently.
    if (value.company) {
      return sendSuccess(res, 201, "Message sent");
    }

    const result = await contactService.createMessage(
      { name: value.name, email: value.email, message: value.message },
      // req.ip, not a raw forwarded header: it is only ever stored as a salted
      // hash, but it still has to be a value the client cannot choose.
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
    const result = await contactService.setHandled(req.params.uuid, req.body.handled);
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
