const mongoose = require("mongoose");
const roles = require("../constants/roles");

const walletChallengeSchema = new mongoose.Schema(
  {
    nonce: String,
    intent: {
      type: String,
      enum: ["login", "link"],
    },
    address: String,
    message: String,
    expiresAt: Date,
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: Object.values(roles),
      default: roles.VOTER,
    },
    walletAddress: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true,
      unique: true,
    },
    pendingWalletAddress: {
      type: String,
      trim: true,
      lowercase: true,
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
    preferredLanguage: {
      type: String,
      default: "en",
      trim: true,
    },
    walletChallenge: walletChallengeSchema,
    linkedWalletAt: Date,
    approvedAt: Date,
    lastLoginAt: Date,
  },
  {
    timestamps: true,
  }
);

userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash;
    delete ret.walletChallenge;
    return ret;
  },
});

module.exports = mongoose.model("User", userSchema);
