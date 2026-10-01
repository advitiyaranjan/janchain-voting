const jwt = require("jsonwebtoken");
const env = require("../config/env");

function signToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
      email: user.email,
      walletAddress: user.walletAddress || null,
      isApproved: user.isApproved,
      preferredLanguage: user.preferredLanguage || "en",
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn, algorithm: "HS256", issuer: "janchain-voting", audience: "janchain-client" }
  );
}

function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"], issuer: "janchain-voting", audience: "janchain-client" });
}

module.exports = {
  signToken,
  verifyToken,
};
