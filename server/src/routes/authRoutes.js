const express = require("express");
const validate = require("../middleware/validate");
const { authenticate } = require("../middleware/authenticate");
const asyncHandler = require("../utils/asyncHandler");
const authController = require("../controllers/authController");
const {
  loginSchema,
  registerSchema,
  walletChallengeSchema,
  walletVerifySchema,
} = require("../validators/authValidators");

const router = express.Router();

function authenticateOptionalForLink(req, res, next) {
  if (req.body && req.body.intent === "link") {
    return authenticate(req, res, next);
  }

  return next();
}

router.post("/register", validate(registerSchema), asyncHandler(authController.register));
router.post("/login", validate(loginSchema), asyncHandler(authController.login));
router.get("/me", authenticate, asyncHandler(authController.getCurrentUser));
router.post(
  "/wallet/challenge",
  authenticateOptionalForLink,
  validate(walletChallengeSchema),
  asyncHandler(authController.issueWalletChallenge)
);
router.post(
  "/wallet/verify",
  authenticateOptionalForLink,
  validate(walletVerifySchema),
  asyncHandler(authController.verifyWalletChallenge)
);

module.exports = router;
