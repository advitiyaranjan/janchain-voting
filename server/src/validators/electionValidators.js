const { z } = require("zod");

const candidateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  party: z.string().trim().max(80).optional().default(""),
  tagline: z.string().trim().max(140).optional().default(""),
  description: z.string().trim().max(300).optional().default(""),
  imageURI: z.string().trim().url().or(z.literal("")).optional().default(""),
});

const createElectionSchema = z.object({
  body: z.object({
    title: z.string().trim().min(5).max(120),
    description: z.string().trim().min(12).max(2000),
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    candidates: z.array(candidateSchema).min(2).max(20),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const approvalSchema = z.object({
  body: z.object({
    approved: z.boolean(),
  }),
  params: z.object({
    userId: z.string().trim().min(10),
  }),
  query: z.object({}).optional(),
});

const syncWalletSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({
    userId: z.string().trim().min(10),
  }),
  query: z.object({}).optional(),
});

const endElectionSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({
    electionId: z.string().trim().min(1),
  }),
  query: z.object({}).optional(),
});

module.exports = {
  createElectionSchema,
  approvalSchema,
  endElectionSchema,
  syncWalletSchema,
};
