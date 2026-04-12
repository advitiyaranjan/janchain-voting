const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const { verifyToken } = require("../utils/jwt");

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.replace("Bearer ", "").trim();
}

async function attachUserIfPresent(req, _res, next) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return next();
    }

    const decoded = verifyToken(token);
    const user = await User.findById(decoded.sub);
    if (user) {
      req.user = user;
    }
    next();
  } catch (_error) {
    next();
  }
}

async function authenticate(req, _res, next) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      throw new ApiError(401, "Authentication token is required.");
    }

    const decoded = verifyToken(token);
    const user = await User.findById(decoded.sub);

    if (!user) {
      throw new ApiError(401, "Your session is no longer valid.");
    }

    req.user = user;
    next();
  } catch (error) {
    next(error instanceof ApiError ? error : new ApiError(401, "Invalid authentication token."));
  }
}

module.exports = {
  authenticate,
  attachUserIfPresent,
};
