const ApiError = require("../utils/ApiError");

function validate(schema) {
  return (req, _res, next) => {
    const parsed = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
    });

    if (!parsed.success) {
      return next(
        new ApiError(
          422,
          "Validation failed.",
          parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          }))
        )
      );
    }

    req.validated = parsed.data;
    next();
  };
}

module.exports = validate;
