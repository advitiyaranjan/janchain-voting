const mongoose = require("mongoose");

const candidateSchema = new mongoose.Schema(
  {
    candidateId: {
      type: Number,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    party: {
      type: String,
      default: "",
      trim: true,
    },
    tagline: {
      type: String,
      default: "",
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    imageURI: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { _id: false }
);

const electionSchema = new mongoose.Schema(
  {
    onChainElectionId: {
      type: Number,
      required: true,
      unique: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      default: "General",
      trim: true,
    },
    accessMode: {
      type: String,
      enum: ["restricted", "open"],
      default: "restricted",
    },
    metadataURI: {
      type: String,
      default: "",
      trim: true,
    },
    contractAddress: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },
    chainId: {
      type: Number,
      required: true,
    },
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["scheduled", "active", "ended"],
      default: "scheduled",
    },
    transactionHash: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    endedAt: Date,
    extendedAt: Date,
    candidates: {
      type: [candidateSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

electionSchema.set("toJSON", {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Election", electionSchema);
