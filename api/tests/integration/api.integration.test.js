'use strict';

/**
 * Integration tests for the Job Application Tracker API.
 *
 * Uses testcontainers-node to spin up a real MongoDB 7 container for each
 * test suite run.  Tests exercise the full CRUD flow against the actual
 * database, including the 503 scenario when MongoDB becomes unavailable.
 *
 * Prerequisites:
 *   – Docker must be running on the host.
 *   – `testcontainers` and `mongodb` must be installed (they are; see package.json).
 */

const http = require('http');
const { GenericContainer, Wait } = require('testcontainers');
const { MongoClient } = require('mongodb');
const { createApp } = require('../../src/app');
const { connect } = require('../../src/db');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Lightweight HTTP client – fires one request against a running http.Server.
 * @param {http.Server} server
 * @param {{ method: string, path: string, body?: object }} opts
 * @returns {Promise<{ status: number, body: any }>}
 */
function req(server, { method, path, body }) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const port = addr.port;
    const payload = body !== undefined ? JSON.stringify(body) : undefined;

    const options = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const request = http.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(raw); } catch (_) { parsed = raw; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });

    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

/**
 * Starts an http.Server wrapping the Express app and returns helpers.
 * @param {import('mongodb').Db} db
 * @returns {Promise<{ server: http.Server, close: () => Promise<void> }>}
 */
function startServer(db) {
  const app = createApp(db);
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        close: () => new Promise(r => server.close(r)),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Suite setup: one MongoDB container shared across all tests in the file.
// ---------------------------------------------------------------------------

let mongoContainer;
let mongoUri;
let mongoClient;

/** Valid base payload reused across tests. */
const BASE_PAYLOAD = {
  company: 'Testcontainers Inc.',
  jobTitle: 'Integration Engineer',
  jobDescription: 'Write thorough tests against a real database.',
  jobLocation: 'Remote, Earth',
  workArrangement: 'Remote',
  payscale: '$100k',
  notes: 'Initial notes.',
};

beforeAll(async () => {
  // Pull and start MongoDB 7 container (binds to a random host port).
  mongoContainer = await new GenericContainer('mongo:7')
    .withExposedPorts(27017)
    .withWaitStrategy(
      Wait.forLogMessage('Waiting for connections', 1)
    )
    .start();

  const host = mongoContainer.getHost();
  const port = mongoContainer.getMappedPort(27017);
  mongoUri = `mongodb://${host}:${port}`;

  // Verify connectivity
  mongoClient = await MongoClient.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
}, 120_000);

afterAll(async () => {
  if (mongoClient) await mongoClient.close();
  if (mongoContainer) await mongoContainer.stop();
}, 30_000);

// ---------------------------------------------------------------------------
// Helper: get a fresh DB for each test (different DB name prevents bleed)
// ---------------------------------------------------------------------------

let testCounter = 0;

async function freshDb() {
  testCounter += 1;
  const dbName = `test_db_${testCounter}_${Date.now()}`;
  return mongoClient.db(dbName);
}

// ===========================================================================
// Test suite 1: End-to-end CRUD flow
// ===========================================================================

describe('Integration – End-to-end CRUD flow', () => {
  let server;
  let closeServer;
  let db;

  beforeEach(async () => {
    db = await freshDb();
    // Create indexes (mirrors what db.connect does at startup)
    const col = db.collection('applications');
    await col.createIndex({ appliedAt: -1 });
    await col.createIndex({ status: 1 });

    const { server: s, close } = await startServer(db);
    server = s;
    closeServer = close;
  });

  afterEach(async () => {
    await closeServer();
  });

  // -------------------------------------------------------------------------
  test('POST /applications returns 201 with full document including _id and appliedAt', async () => {
    const res = await req(server, {
      method: 'POST',
      path: '/applications',
      body: BASE_PAYLOAD,
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      company: 'Testcontainers Inc.',
      jobTitle: 'Integration Engineer',
      status: 'Applied',
    });
    expect(res.body._id).toBeTruthy();
    expect(res.body.appliedAt).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  test('GET /applications returns the created document in the list', async () => {
    await req(server, { method: 'POST', path: '/applications', body: BASE_PAYLOAD });

    const res = await req(server, { method: 'GET', path: '/applications' });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    const found = res.body.find(d => d.company === 'Testcontainers Inc.');
    expect(found).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  test('GET /applications/:id returns the document by ID', async () => {
    const createRes = await req(server, {
      method: 'POST',
      path: '/applications',
      body: BASE_PAYLOAD,
    });
    const id = createRes.body._id;

    const res = await req(server, { method: 'GET', path: `/applications/${id}` });

    expect(res.status).toBe(200);
    expect(res.body._id).toBe(id);
    expect(res.body.company).toBe('Testcontainers Inc.');
  });

  // -------------------------------------------------------------------------
  test('GET /applications/:id returns 404 for an unknown ID', async () => {
    const res = await req(server, {
      method: 'GET',
      path: '/applications/6648e4b6f4e2a1b2c3d4e5f6',
    });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  // -------------------------------------------------------------------------
  test('PUT /applications/:id updates a field and returns the updated document', async () => {
    const createRes = await req(server, {
      method: 'POST',
      path: '/applications',
      body: BASE_PAYLOAD,
    });
    const id = createRes.body._id;
    const originalAppliedAt = createRes.body.appliedAt;

    const putRes = await req(server, {
      method: 'PUT',
      path: `/applications/${id}`,
      body: { status: 'Phone Screen', notes: 'Had initial call.' },
    });

    expect(putRes.status).toBe(200);
    expect(putRes.body.status).toBe('Phone Screen');
    expect(putRes.body.notes).toBe('Had initial call.');
    // appliedAt must remain unchanged
    expect(new Date(putRes.body.appliedAt).getTime()).toBe(new Date(originalAppliedAt).getTime());
  });

  // -------------------------------------------------------------------------
  test('PUT /applications/:id ignores appliedAt in request body', async () => {
    const createRes = await req(server, {
      method: 'POST',
      path: '/applications',
      body: BASE_PAYLOAD,
    });
    const id = createRes.body._id;
    const originalAppliedAt = createRes.body.appliedAt;

    const tamperedDate = new Date('2000-01-01T00:00:00.000Z').toISOString();

    const putRes = await req(server, {
      method: 'PUT',
      path: `/applications/${id}`,
      body: { status: 'Interview', appliedAt: tamperedDate },
    });

    expect(putRes.status).toBe(200);
    expect(new Date(putRes.body.appliedAt).getTime()).toBe(new Date(originalAppliedAt).getTime());
  });

  // -------------------------------------------------------------------------
  test('PUT /applications/:id returns 400 for an invalid status value', async () => {
    const createRes = await req(server, {
      method: 'POST',
      path: '/applications',
      body: BASE_PAYLOAD,
    });
    const id = createRes.body._id;

    const res = await req(server, {
      method: 'PUT',
      path: `/applications/${id}`,
      body: { status: 'NotARealStatus' },
    });

    expect(res.status).toBe(400);
  });

  // -------------------------------------------------------------------------
  test('DELETE /applications/:id returns 204 and removes the record', async () => {
    const createRes = await req(server, {
      method: 'POST',
      path: '/applications',
      body: BASE_PAYLOAD,
    });
    const id = createRes.body._id;

    const deleteRes = await req(server, {
      method: 'DELETE',
      path: `/applications/${id}`,
    });
    expect(deleteRes.status).toBe(204);

    // GET/:id must now 404
    const getRes = await req(server, {
      method: 'GET',
      path: `/applications/${id}`,
    });
    expect(getRes.status).toBe(404);

    // GET / must not include it
    const listRes = await req(server, { method: 'GET', path: '/applications' });
    const ids = listRes.body.map(r => r._id);
    expect(ids).not.toContain(id);
  });

  // -------------------------------------------------------------------------
  test('DELETE /applications/:id returns 404 for a non-existent ID', async () => {
    const res = await req(server, {
      method: 'DELETE',
      path: '/applications/6648e4b6f4e2a1b2c3d4e5f6',
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  // -------------------------------------------------------------------------
  test('POST /applications returns 400 with field errors when required fields are missing', async () => {
    const res = await req(server, {
      method: 'POST',
      path: '/applications',
      body: { company: 'Only Company' },
    });

    expect(res.status).toBe(400);
    expect(res.body.fields).toHaveProperty('jobTitle');
    expect(res.body.fields).toHaveProperty('jobDescription');
    expect(res.body.fields).toHaveProperty('jobLocation');
    expect(res.body.fields).toHaveProperty('workArrangement');
  });

  // -------------------------------------------------------------------------
  test('GET /applications returns results sorted by appliedAt descending', async () => {
    // Insert three records with explicit ordering
    const payloads = [
      { ...BASE_PAYLOAD, company: 'Alpha' },
      { ...BASE_PAYLOAD, company: 'Beta' },
      { ...BASE_PAYLOAD, company: 'Gamma' },
    ];

    for (const p of payloads) {
      await req(server, { method: 'POST', path: '/applications', body: p });
      await new Promise(r => setTimeout(r, 5)); // ensure distinct timestamps
    }

    const res = await req(server, { method: 'GET', path: '/applications' });

    expect(res.status).toBe(200);
    const records = res.body;
    for (let i = 0; i < records.length - 1; i++) {
      const ta = new Date(records[i].appliedAt).getTime();
      const tb = new Date(records[i + 1].appliedAt).getTime();
      expect(ta).toBeGreaterThanOrEqual(tb);
    }
  });
});

// ===========================================================================
// Test suite 2: 503 scenario when MongoDB is unavailable
// ===========================================================================

describe('Integration – 503 when database is unavailable', () => {
  test('API returns 503 when the MongoDB connection is broken', async () => {
    // Connect to a URI that will reject immediately (nothing listening).
    // We bypass connect() (which calls process.exit) and instead build a db
    // handle around a MongoClient whose connection is closed after creation.
    const badUri = 'mongodb://127.0.0.1:19999'; // nothing listening here

    // Create a minimal failing db stub that throws on every collection operation,
    // mimicking what happens when the MongoDB client can no longer reach the server.
    const failingDb = {
      collection(_name) {
        return {
          insertOne() { return Promise.reject(new Error('connection refused')); },
          find() {
            return {
              sort() {
                return {
                  toArray() { return Promise.reject(new Error('connection refused')); },
                };
              },
            };
          },
          findOne() { return Promise.reject(new Error('connection refused')); },
          findOneAndUpdate() { return Promise.reject(new Error('connection refused')); },
          deleteOne() { return Promise.reject(new Error('connection refused')); },
          createIndex() { return Promise.resolve(); },
        };
      },
    };

    const { server, close } = await startServer(failingDb);

    try {
      // POST should return 503
      const postRes = await req(server, {
        method: 'POST',
        path: '/applications',
        body: BASE_PAYLOAD,
      });
      expect(postRes.status).toBe(503);
      expect(postRes.body.error).toMatch(/Database unavailable/i);

      // GET / should return 503
      const getRes = await req(server, { method: 'GET', path: '/applications' });
      expect(getRes.status).toBe(503);
      expect(getRes.body.error).toMatch(/Database unavailable/i);

      // GET /:id should return 503
      const getByIdRes = await req(server, {
        method: 'GET',
        path: '/applications/6648e4b6f4e2a1b2c3d4e5f6',
      });
      expect(getByIdRes.status).toBe(503);

      // PUT /:id should return 503
      const putRes = await req(server, {
        method: 'PUT',
        path: '/applications/6648e4b6f4e2a1b2c3d4e5f6',
        body: { status: 'Interview' },
      });
      expect(putRes.status).toBe(503);

      // DELETE /:id should return 503
      const deleteRes = await req(server, {
        method: 'DELETE',
        path: '/applications/6648e4b6f4e2a1b2c3d4e5f6',
      });
      expect(deleteRes.status).toBe(503);
    } finally {
      await close();
    }
  }, 15_000);
});
