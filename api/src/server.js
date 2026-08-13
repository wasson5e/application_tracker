'use strict';

const { loadConfig } = require('./config');
const { connect } = require('./db');
const { createApp } = require('./app');

/**
 * Application entry point.
 *
 * Startup sequence:
 *   1. Load and validate configuration from environment / .env file.
 *   2. Connect to MongoDB (exits with code 1 on failure).
 *   3. Create the Express app with the live db handle.
 *   4. Start listening on API_PORT.
 */
async function main() {
  // Step 1 – load config (exits on invalid/missing values).
  const { port, mongodbUri, dbName, resumePath } = loadConfig();

  // Step 2 – connect to MongoDB (exits on connection failure).
  const db = await connect(mongodbUri, dbName);

  // Step 3 – wire up Express app with the db handle.
  const app = createApp(db, { resumePath });

  // Step 4 – start listening.
  app.listen(port, () => {
    process.stdout.write(`API server listening on port ${port}\n`);
  });
}

main();
