const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const adminController = require("../controllers/adminController");
const validate = require("../middleware/validate");
const {
  approvalSchema,
  bulkApprovalSchema,
  createElectionSchema,
  endElectionSchema,
  extendElectionSchema,
  pauseSchema,
  syncWalletSchema,
} = require("../validators/electionValidators");

const router = express.Router();

router.get("/dashboard", asyncHandler(adminController.getDashboard));
router.get("/users", asyncHandler(adminController.listUsers));
router.post("/users/bulk-approval", validate(bulkApprovalSchema), asyncHandler(adminController.bulkUpdateApproval));
router.patch(
  "/users/:userId/approval",
  validate(approvalSchema),
  asyncHandler(adminController.updateUserApproval)
);
router.post(
  "/users/:userId/sync-wallet",
  validate(syncWalletSchema),
  asyncHandler(adminController.syncUserWallet)
);
router.post("/elections", validate(createElectionSchema), asyncHandler(adminController.createElection));
router.patch(
  "/elections/:electionId/end",
  validate(endElectionSchema),
  asyncHandler(adminController.endElection)
);
router.patch(
  "/elections/:electionId/extend",
  validate(extendElectionSchema),
  asyncHandler(adminController.extendElection)
);
router.post("/system/pause", validate(pauseSchema), asyncHandler(adminController.setVotingPaused));

module.exports = router;
