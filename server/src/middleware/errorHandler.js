function notFoundHandler(_req, res) {
  res.status(404).json({
    message: "Route not found.",
  });
}

function errorHandler(error, _req, res, _next) {
  const statusCode = error.code === 11000 ? 409 : error.statusCode || error.status || 500;
  const payload = {
    message: error.code === 11000 ? "That email or wallet is already registered." :
      process.env.NODE_ENV === "production" && statusCode >= 500 ? "The service is temporarily unavailable. Please try again." : error.message || "Internal server error.",
  };

  if (error.details && statusCode < 500) {
    payload.details = error.details;
  }

  if (process.env.NODE_ENV !== "production" && error.stack) {
    payload.stack = error.stack;
  }

  res.status(statusCode).json(payload);
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
