const sendSuccess = (res, statusCode = 200, message = "Success", data = null) => {
  const payload = { success: true, message };
  if (data !== null) payload.data = data;
  return res.status(statusCode).json(payload);
};


const sendError = (res, statusCode = 500, message = "Something went wrong", errors = null) => {
  const payload = { success: false, message };
  if (errors !== null) payload.errors = errors;
  return res.status(statusCode).json(payload);
};

module.exports = { sendSuccess, sendError };
