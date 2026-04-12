const { z } = require("zod");

const walletAddress = z
  .string()
  .trim()
  .regex(/^0x[a-fA-F0-9]{40}$/, "A valid wallet address is required.");

const registerSchema = z.object({
  body: z.object({
    fullName: z.string().trim().min(3).max(120),
    email: z.string().trim().email(),
    password: z
      .string()
      .min(8)
      .regex(/[A-Z]/, "Password must include an uppercase letter.")
      .regex(/[a-z]/, "Password must include a lowercase letter.")
      .regex(/[0-9]/, "Password must include a number."),
    walletAddress: walletAddress.optional(),
    preferredLanguage: z.string().trim().min(2).max(10).optional(),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().trim().email(),
    password: z.string().min(8),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const walletChallengeSchema = z.object({
  body: z.object({
    walletAddress,
    intent: z.enum(["login", "link"]).default("login"),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const walletVerifySchema = z.object({
  body: z.object({
    walletAddress,
    signature: z.string().trim().min(10),
    intent: z.enum(["login", "link"]).default("login"),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

module.exports = {
  registerSchema,
  loginSchema,
  walletChallengeSchema,
  walletVerifySchema,
};
