'use strict';

const { MongoClient } = require('mongodb');

/**
 * Connects to MongoDB and returns the database handle.
 *
 * On success the function:
 *   1. Connects with a 30-second serverSelectionTimeoutMS.
 *   2. Creates the required indexes on the `applications` collection.
 *   3. Returns the Db instance for the named database.
 *
 * On failure the function logs host, port, and database name to stderr,
 * then calls process.exit(1).
 *
 * @param {string} uri    - MongoDB connection URI (e.g. "mongodb://host:27017")
 * @param {string} dbName - Name of the database to use
 * @returns {Promise<import('mongodb').Db>}
 */
async function connect(uri, dbName) {
  let client;

  try {
    client = await MongoClient.connect(uri, {
      serverSelectionTimeoutMS: 30000,
    });
  } catch (err) {
    // Parse host and port out of the URI for the error message.
    let host = 'unknown';
    let port = 'unknown';
    try {
      const parsed = new URL(uri);
      host = parsed.hostname || 'unknown';
      port = parsed.port || '27017';
    } catch (_) {
      // If the URI is unparseable we fall through with the defaults above.
    }

    process.stderr.write(
      `Failed to connect to MongoDB: host=${host}, port=${port}, database=${dbName}\n`
    );
    process.exit(1);
  }

  const db = client.db(dbName);

  // Create indexes on the applications collection at startup.
  const collection = db.collection('applications');
  await collection.createIndex({ appliedAt: -1 });
  await collection.createIndex({ status: 1 });

  return db;
}

module.exports = { connect };
