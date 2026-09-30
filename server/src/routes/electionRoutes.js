const express = require("express");
const rateLimit = require("express-rate-limit");
const { attachUserIfPresent, authenticate } = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const asyncHandler = require("../utils/asyncHandler");
const electionController = require("../controllers/electionController");
const { relayVoteSchema } = require("../validators/electionValidators");

const router = express.Router();

const relayLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many ballot submissions. Please wait a few minutes and try again." },
});

router.get("/", attachUserIfPresent, asyncHandler(electionController.listElections));
router.get("/stats", asyncHandler(electionController.getPlatformStats));
router.get("/me/ballots", authenticate, asyncHandler(electionController.getMyBallots));
router.get("/:electionId", attachUserIfPresent, asyncHandler(electionController.getElection));
router.get("/:electionId/results", attachUserIfPresent, asyncHandler(electionController.getResults));
router.get("/:electionId/activity", asyncHandler(electionController.getActivity));
router.get("/:electionId/verify/:walletAddress", asyncHandler(electionController.verifyVote));
router.post(
  "/:electionId/relay-vote",
  relayLimiter,
  authenticate,
  validate(relayVoteSchema),
  asyncHandler(electionController.relayVote)
);

module.exports = router;
