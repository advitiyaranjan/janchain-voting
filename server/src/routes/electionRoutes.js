const express = require("express");
const { attachUserIfPresent } = require("../middleware/authenticate");
const asyncHandler = require("../utils/asyncHandler");
const electionController = require("../controllers/electionController");

const router = express.Router();

router.get("/", attachUserIfPresent, asyncHandler(electionController.listElections));
router.get("/:electionId", attachUserIfPresent, asyncHandler(electionController.getElection));
router.get("/:electionId/results", attachUserIfPresent, asyncHandler(electionController.getResults));
router.get("/:electionId/verify/:walletAddress", asyncHandler(electionController.verifyVote));

module.exports = router;
