const { z } = require("zod");

const objectId = z.string().trim().regex(/^[a-f0-9]{24}$/i, "A valid id is required.");
const walletAddress = z
  .string()
  .trim()
  .regex(/^0x[a-fA-F0-9]{40}$/, "A valid wallet address is required.");

const candidateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  party: z.string().trim().max(80).optional().default(""),
  tagline: z.string().trim().max(140).optional().default(""),
  description: z.string().trim().max(300).optional().default(""),
  imageURI: z.string().trim().url().or(z.literal("")).optional().default(""),
});

const createElectionSchema = z.object({
  body: z
    .object({
      title: z.string().trim().min(5).max(120),
      description: z.string().trim().min(12).max(2000),
      category: z.string().trim().min(2).max(40).optional().default("General"),
      accessMode: z.enum(["restricted", "open"]).optional().default("restricted"),
      startTime: z.string().datetime(),
      endTime: z.string().datetime(),
      candidates: z.array(candidateSchema).min(2).max(20),
    })
    .refine((body) => new Date(body.endTime) > new Date(body.startTime), {
      message: "End time must be after the start time.",
      path: ["endTime"],
    })
    .refine((body) => new Date(body.startTime).getTime() > Date.now(), {
      message: "Start time must be in the future.",
      path: ["startTime"],
    }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const approvalSchema = z.object({
  body: z.object({
    approved: z.boolean(),
  }),
  params: z.object({
    userId: objectId,
  }),
  query: z.object({}).optional(),
});

const bulkApprovalSchema = z.object({
  body: z.object({
    userIds: z.array(objectId).min(1).max(200),
    approved: z.boolean(),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const syncWalletSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({
    userId: objectId,
  }),
  query: z.object({}).optional(),
});

const endElectionSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({
    electionId: objectId,
  }),
  query: z.object({}).optional(),
});

const extendElectionSchema = z.object({
  body: z.object({
    endTime: z.string().datetime(),
  }),
  params: z.object({
    electionId: objectId,
  }),
  query: z.object({}).optional(),
});

const pauseSchema = z.object({
  body: z.object({
    paused: z.boolean(),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const relayVoteSchema = z.object({
  body: z.object({
    candidateId: z.number().int().positive(),
    voterAddress: walletAddress,
    deadline: z.number().int().positive(),
    signature: z.string().trim().regex(/^0x[a-fA-F0-9]+$/, "A hex signature is required."),
  }),
  params: z.object({
    electionId: objectId,
  }),
  query: z.object({}).optional(),
});

module.exports = {
  approvalSchema,
  bulkApprovalSchema,
  createElectionSchema,
  endElectionSchema,
  extendElectionSchema,
  pauseSchema,
  relayVoteSchema,
  syncWalletSchema,
};
