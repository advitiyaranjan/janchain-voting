const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const app = require("../src/app");

test("readiness returns 503 when the API cannot access its database", async () => {
  const previous = mongoose.connection.readyState;
  mongoose.connection.readyState = 0;
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/ready`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: "unavailable", database: "disconnected" });
  } finally { mongoose.connection.readyState = previous; server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});

test("readiness returns 200 after the database connects", async () => {
  const previous = mongoose.connection.readyState;
  mongoose.connection.readyState = 1;
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/ready`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ready", database: "connected" });
  } finally { mongoose.connection.readyState = previous; server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});
