const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");
const env = require("./config/env");
const { authenticate } = require("./middleware/authenticate");
const authorize = require("./middleware/authorize");
const roles = require("./constants/roles");
const authRoutes = require("./routes/authRoutes");
const electionRoutes = require("./routes/electionRoutes");
const adminRoutes = require("./routes/adminRoutes");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");

const app = express();

app.use(
  cors({
    origin: env.clientUrl,
    credentials: true,
  })
);
app.use(helmet());
app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "1mb" }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "janchain-voting-api",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/ready", (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    status: connected ? "ready" : "unavailable",
    database: connected ? "connected" : "disconnected",
  });
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/elections", electionRoutes);
app.use("/api/admin", authenticate, authorize(roles.ADMIN), adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
