const app = require("./app");
const env = require("./config/env");
const connectDatabase = require("./config/database");

async function startServer() {
  await connectDatabase();

  app.listen(env.port, () => {
    console.log(`API listening on http://localhost:${env.port}`);
  });
}

startServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
