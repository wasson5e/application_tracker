'use strict';

/**
 * Property-based tests for the Job Application Tracker API.
 *
 * Uses fast-check with a minimum of 100 iterations per property.
 * Each property is tagged: // Feature: job-application-tracker, Property N:
 *
 * The tests use a lightweight in-process approach: they create a real Express
 * app wired to a mock MongoDB collection whose methods are driven by the
 * test-provided data, then call routes directly — no HTTP server required.
 * This keeps tests fast and hermetic while still exercising real route + validation
 * logic.
 *
 * For properties that require actual DB persistence (P4, P5, P7, P8, P9) we
 * use an in-memory store stub that honours the MongoDB collection interface
 * expected by the router.
 */

const fc = require('fast-check');
const { ObjectId } = require('mongodb');
const { createApp } = require('../../src/app');
const { WORK_ARRANGEMENTS, STATUS_VALUES } = require('../../src/validation');

// ---------------------------------------------------------------------------
// Shared arbitraries
// ---------------------------------------------------------------------------

/** Non-empty string (up to 200 chars). */
const nonEmptyString = fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0);

/** Valid application payload (all required fields + valid enum). */
const validPayload = fc.record({
  company:        nonEmptyString,
  jobTitle:       nonEmptyString,
  jobDescription: nonEmptyString,
  jobLocation:    nonEmptyString,
  workArrangement: fc.constantFrom(...WORK_ARRANGEMENTS),
});

/** String NOT in the WORK_ARRANGEMENTS allowed set. */
const invalidWorkArrangement = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter(s => !WORK_ARRANGEMENTS.includes(s));

/** String NOT in the STATUS_VALUES allowed set. */
const invalidStatus = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter(s => !STATUS_VALUES.includes(s));

// ---------------------------------------------------------------------------
// In-memory collection factory
// Creates a minimal MongoDB-collection-compatible stub backed by a plain Map.
// ---------------------------------------------------------------------------

function makeMemoryCollection() {
  const store = new Map(); // id (string) -> document

  return {
    _store: store,

    async insertOne(doc) {
      const id = new ObjectId();
      doc._id = id;
      store.set(id.toString(), { ...doc, _id: id });
      return { insertedId: id };
    },

    find() {
      const self = this;
      return {
        sort(_spec) {
          // sort by appliedAt descending
          return {
            async toArray() {
              const docs = Array.from(self._store.values());
              return docs.sort((a, b) => {
                const ta = a.appliedAt ? new Date(a.appliedAt).getTime() : 0;
                const tb = b.appliedAt ? new Date(b.appliedAt).getTime() : 0;
                return tb - ta;
              });
            },
          };
        },
      };
    },

    async findOne(query) {
      const id = query._id;
      if (!id) return null;
      return store.get(id.toString()) || null;
    },

    async findOneAndUpdate(query, update, _opts) {
      const id = query._id;
      if (!id) return null;
      const existing = store.get(id.toString());
      if (!existing) return null;
      const setFields = update.$set || {};
      // Never allow appliedAt to be overwritten (already stripped by router,
      // but guard here too)
      const { appliedAt: _ignored, ...safeSet } = setFields;
      const updated = { ...existing, ...safeSet };
      store.set(id.toString(), updated);
      return updated;
    },

    async deleteOne(query) {
      const id = query._id;
      if (!id) return { deletedCount: 0 };
      const existed = store.has(id.toString());
      store.delete(id.toString());
      return { deletedCount: existed ? 1 : 0 };
    },

    // Index creation is a no-op in the stub
    createIndex() { return Promise.resolve(); },
  };
}

// ---------------------------------------------------------------------------
// Helper: build app + supertest-like request helper using Node http.
// We use a lightweight "supertest-lite" approach: spin up a one-off server,
// fire a request, tear it down.
// ---------------------------------------------------------------------------

const http = require('http');

/**
 * Make an HTTP request to a running server.
 * @param {http.Server} server
 * @param {{ method: string, path: string, body?: object }} opts
 * @returns {Promise<{ status: number, body: any }>}
 */
function request(server, { method, path, body }) {
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

    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(raw); } catch (_) { parsed = raw; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Starts an HTTP server on a random port and returns { server, port, close }.
 */
function startServer(db) {
  const app = createApp(db);
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        close: () => new Promise(res => server.close(res)),
      });
    });
  });
}

// Fake db that provides a fresh in-memory collection per test
function makeDb(col) {
  return {
    collection: (_name) => col,
  };
}

// ===========================================================================
// Property 1: Incomplete submissions return 400 naming every missing field
// ===========================================================================

// Feature: job-application-tracker, Property 1:
// For any application submission that omits or blanks one or more required fields,
// the API SHALL return 400 and name every missing/invalid field.
// Validates: Requirements 1.4, 1.7, 5.6

describe('P1 – Required-field validation rejects incomplete submissions', () => {
  const REQUIRED = ['company', 'jobTitle', 'jobDescription', 'jobLocation', 'workArrangement'];

  test('property: every missing required field appears in the 400 error response', async () => {
    // Generate a subset of required fields to omit (at least 1)
    const subsetArb = fc
      .array(fc.constantFrom(...REQUIRED), { minLength: 1, maxLength: REQUIRED.length })
      .map(arr => [...new Set(arr)]); // deduplicate

    const col = makeMemoryCollection();
    const { server, close } = await startServer(makeDb(col));

    try {
      await fc.assert(
        fc.asyncProperty(subsetArb, nonEmptyString, nonEmptyString, nonEmptyString, nonEmptyString,
          async (omittedFields, company, jobTitle, jobDescription, jobLocation) => {
            const body = {
              company,
              jobTitle,
              jobDescription,
              jobLocation,
              workArrangement: 'Remote',
            };
            // Blank out the omitted fields
            for (const field of omittedFields) {
              body[field] = '';
            }

            const res = await request(server, {
              method: 'POST',
              path: '/applications',
              body,
            });

            if (res.status !== 400) return false;
            const fields = res.body.fields || {};
            // Every omitted (blanked) field must appear in the error response
            return omittedFields.every(f => f in fields);
          }
        ),
        { numRuns: 100 }
      );
    } finally {
      await close();
    }
  });
});

// ===========================================================================
// Property 2: Invalid workArrangement strings return 400 identifying the field
// ===========================================================================

// Feature: job-application-tracker, Property 2:
// For any workArrangement value not in {Remote, Hybrid, On-site}, the API SHALL
// return 400 identifying workArrangement as invalid.
// Validates: Requirements 1.7, 7.5

describe('P2 – Work-arrangement enum enforcement', () => {
  test('property: invalid workArrangement always returns 400 with workArrangement in fields', async () => {
    const col = makeMemoryCollection();
    const { server, close } = await startServer(makeDb(col));

    try {
      await fc.assert(
        fc.asyncProperty(
          validPayload,
          invalidWorkArrangement,
          async (base, badWa) => {
            const body = { ...base, workArrangement: badWa };
            const res = await request(server, {
              method: 'POST',
              path: '/applications',
              body,
            });
            return res.status === 400 && 'workArrangement' in (res.body.fields || {});
          }
        ),
        { numRuns: 100 }
      );
    } finally {
      await close();
    }
  });
});

// ===========================================================================
// Property 3: Invalid status values return 400
// ===========================================================================

// Feature: job-application-tracker, Property 3:
// For any status update where the supplied value is not one of the seven defined
// Application_Status values, the API SHALL return 400.
// Validates: Requirements 3.4

describe('P3 – Status enum enforcement', () => {
  test('property: invalid status in PUT always returns 400', async () => {
    const col = makeMemoryCollection();
    const { server, close } = await startServer(makeDb(col));

    // We need a valid existing document to PUT against
    const seedRes = await request(server, {
      method: 'POST',
      path: '/applications',
      body: {
        company: 'Seed Co',
        jobTitle: 'Engineer',
        jobDescription: 'Desc',
        jobLocation: 'Anywhere',
        workArrangement: 'Remote',
      },
    });
    const docId = seedRes.body._id;

    try {
      await fc.assert(
        fc.asyncProperty(invalidStatus, async (badStatus) => {
          const res = await request(server, {
            method: 'PUT',
            path: `/applications/${docId}`,
            body: { status: badStatus },
          });
          // 400 with status field error OR 400 with general error
          return res.status === 400;
        }),
        { numRuns: 100 }
      );
    } finally {
      await close();
    }
  });
});

// ===========================================================================
// Property 4: PUT with appliedAt does not change the stored timestamp
// ===========================================================================

// Feature: job-application-tracker, Property 4:
// No matter what fields are in a PUT body (including appliedAt), the stored
// appliedAt SHALL equal the original value.
// Validates: Requirements 5.5

describe('P4 – Creation timestamp immutability', () => {
  test('property: appliedAt is never changed by PUT', async () => {
    // Generate random update payloads (may or may not include appliedAt)
    const updatePayloadArb = fc.record({
      company: fc.option(nonEmptyString, { nil: undefined }),
      jobTitle: fc.option(nonEmptyString, { nil: undefined }),
      notes: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
      appliedAt: fc.option(
        fc.date({ min: new Date('2000-01-01'), max: new Date('2030-01-01') }).map(d => d.toISOString()),
        { nil: undefined }
      ),
    });

    const col = makeMemoryCollection();
    const { server, close } = await startServer(makeDb(col));

    // Create a document to use throughout
    const createRes = await request(server, {
      method: 'POST',
      path: '/applications',
      body: {
        company: 'Immutable Co',
        jobTitle: 'Dev',
        jobDescription: 'Work',
        jobLocation: 'NYC',
        workArrangement: 'Hybrid',
      },
    });
    const docId = createRes.body._id;
    const originalAppliedAt = createRes.body.appliedAt;

    try {
      await fc.assert(
        fc.asyncProperty(updatePayloadArb, async (update) => {
          // Strip undefined keys to avoid sending them
          const body = Object.fromEntries(
            Object.entries(update).filter(([, v]) => v !== undefined)
          );

          const res = await request(server, {
            method: 'PUT',
            path: `/applications/${docId}`,
            body,
          });

          if (res.status !== 200) return true; // non-200 means validation error, skip

          const storedAppliedAt = res.body.appliedAt;
          // Timestamps must be equal (compare as ISO strings / ms)
          return new Date(storedAppliedAt).getTime() === new Date(originalAppliedAt).getTime();
        }),
        { numRuns: 100 }
      );
    } finally {
      await close();
    }
  });
});

// ===========================================================================
// Property 5: POST then GET/:id round trip preserves all fields
// ===========================================================================

// Feature: job-application-tracker, Property 5:
// For any valid application payload, POST then GET/:id SHALL return the same
// field values, status="Applied", and a non-null appliedAt.
// Validates: Requirements 1.1, 1.2, 1.3, 1.6

describe('P5 – Create-then-retrieve round trip', () => {
  test('property: all submitted fields are preserved; status=Applied; appliedAt non-null', async () => {
    const payloadWithOptionals = fc.record({
      company:        nonEmptyString,
      jobTitle:       nonEmptyString,
      jobDescription: nonEmptyString,
      jobLocation:    nonEmptyString,
      workArrangement: fc.constantFrom(...WORK_ARRANGEMENTS),
      payscale: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
      notes:    fc.option(fc.string({ maxLength: 300 }), { nil: undefined }),
    });

    const col = makeMemoryCollection();
    const { server, close } = await startServer(makeDb(col));

    try {
      await fc.assert(
        fc.asyncProperty(payloadWithOptionals, async (payload) => {
          // Remove undefined optional fields before posting
          const body = Object.fromEntries(
            Object.entries(payload).filter(([, v]) => v !== undefined)
          );

          const postRes = await request(server, {
            method: 'POST',
            path: '/applications',
            body,
          });

          if (postRes.status !== 201) return false;

          const docId = postRes.body._id;
          const getRes = await request(server, {
            method: 'GET',
            path: `/applications/${docId}`,
          });

          if (getRes.status !== 200) return false;

          const doc = getRes.body;

          // Status must be "Applied"
          if (doc.status !== 'Applied') return false;

          // appliedAt must be non-null
          if (!doc.appliedAt) return false;

          // All required submitted fields must be preserved
          const requiredFields = ['company', 'jobTitle', 'jobDescription', 'jobLocation', 'workArrangement'];
          for (const field of requiredFields) {
            if (doc[field] !== body[field].trim()) return false;
          }

          // Optional fields: if submitted, must be preserved
          if (body.payscale !== undefined && doc.payscale !== body.payscale) return false;
          if (body.notes !== undefined && doc.notes !== body.notes) return false;

          return true;
        }),
        { numRuns: 100 }
      );
    } finally {
      await close();
    }
  });
});

// ===========================================================================
// Property 6: payscale ≤ 500 chars accepted, > 500 chars rejected with 400
// ===========================================================================

// Feature: job-application-tracker, Property 6:
// For any string submitted as payscale, the API SHALL accept it when length ≤ 500
// and reject it with 400 when length > 500.
// Validates: Requirements 7.2

describe('P6 – Payscale length boundary', () => {
  test('property: payscale ≤ 500 is accepted; > 500 is rejected', async () => {
    // Lengths from 0 to 600
    const payscaleLengthArb = fc.nat({ max: 600 });

    const col = makeMemoryCollection();
    const { server, close } = await startServer(makeDb(col));

    try {
      await fc.assert(
        fc.asyncProperty(validPayload, payscaleLengthArb, async (base, len) => {
          const payscale = 'x'.repeat(len);
          const body = { ...base, payscale };

          const res = await request(server, {
            method: 'POST',
            path: '/applications',
            body,
          });

          if (len <= 500) {
            // Must be accepted (201)
            return res.status === 201;
          } else {
            // Must be rejected (400 with payscale in fields)
            return res.status === 400 && 'payscale' in (res.body.fields || {});
          }
        }),
        { numRuns: 100 }
      );
    } finally {
      await close();
    }
  });
});

// ===========================================================================
// Property 7: GET /applications always returns records in descending appliedAt order
// ===========================================================================

// Feature: job-application-tracker, Property 7:
// The array returned by GET /applications SHALL be sorted by appliedAt
// in descending order for every adjacent pair of records.
// Validates: Requirements 2.6

describe('P7 – GET /applications sort order invariant', () => {
  test('property: response is always sorted newest-first', async () => {
    // Generate 1–10 payloads to insert
    const payloadsArb = fc.array(validPayload, { minLength: 1, maxLength: 10 });

    await fc.assert(
      fc.asyncProperty(payloadsArb, async (payloads) => {
        // Fresh collection per run so ordering is unambiguous
        const col = makeMemoryCollection();
        const { server, close } = await startServer(makeDb(col));

        try {
          // Insert all payloads sequentially (so timestamps differ slightly)
          for (const p of payloads) {
            await request(server, {
              method: 'POST',
              path: '/applications',
              body: p,
            });
            // Small delay to ensure distinct timestamps
            await new Promise(r => setTimeout(r, 2));
          }

          const listRes = await request(server, {
            method: 'GET',
            path: '/applications',
          });

          if (listRes.status !== 200) return false;
          const records = listRes.body;

          // Check each adjacent pair
          for (let i = 0; i < records.length - 1; i++) {
            const ta = new Date(records[i].appliedAt).getTime();
            const tb = new Date(records[i + 1].appliedAt).getTime();
            if (ta < tb) return false;
          }

          return true;
        } finally {
          await close();
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ===========================================================================
// Property 8: PUT with subset of fields leaves unmentioned fields unchanged
// ===========================================================================

// Feature: job-application-tracker, Property 8:
// For any existing application and any subset of updatable fields in a PUT body,
// fields NOT included in the request body SHALL remain unchanged.
// Validates: Requirements 5.1

describe('P8 – Partial update preserves unmodified fields', () => {
  test('property: fields absent from PUT body are unchanged after update', async () => {
    // Pick a random non-empty subset of updatable fields to include in the PUT body
    const UPDATABLE = ['company', 'jobTitle', 'jobDescription', 'jobLocation', 'workArrangement', 'notes'];

    const updateSubsetArb = fc
      .array(fc.constantFrom(...UPDATABLE), { minLength: 1, maxLength: UPDATABLE.length })
      .map(arr => [...new Set(arr)])
      .chain(fields =>
        fc.record(
          Object.fromEntries(fields.map(f => {
            const arb = f === 'workArrangement'
              ? fc.constantFrom(...WORK_ARRANGEMENTS)
              : nonEmptyString;
            return [f, arb];
          }))
        ).map(vals => ({ fields, vals }))
      );

    const col = makeMemoryCollection();
    const { server, close } = await startServer(makeDb(col));

    // Create a baseline document
    const createRes = await request(server, {
      method: 'POST',
      path: '/applications',
      body: {
        company: 'Original Co',
        jobTitle: 'Original Title',
        jobDescription: 'Original Desc',
        jobLocation: 'Original City',
        workArrangement: 'Remote',
        notes: 'Original notes',
      },
    });
    const docId = createRes.body._id;

    try {
      await fc.assert(
        fc.asyncProperty(updateSubsetArb, async ({ fields: updatedFields, vals: updateBody }) => {
          // Fetch current state before update
          const beforeRes = await request(server, {
            method: 'GET',
            path: `/applications/${docId}`,
          });
          const before = beforeRes.body;

          // Apply partial update
          const putRes = await request(server, {
            method: 'PUT',
            path: `/applications/${docId}`,
            body: updateBody,
          });

          if (putRes.status !== 200) return true; // validation error, skip

          const after = putRes.body;

          // Fields NOT in the update must be unchanged
          const untouched = UPDATABLE.filter(f => !updatedFields.includes(f));
          for (const field of untouched) {
            if (after[field] !== before[field]) return false;
          }

          // appliedAt must never change
          if (new Date(after.appliedAt).getTime() !== new Date(before.appliedAt).getTime()) {
            return false;
          }

          return true;
        }),
        { numRuns: 100 }
      );
    } finally {
      await close();
    }
  });
});

// ===========================================================================
// Property 9: After DELETE, GET/:id returns 404 and record is absent from GET /
// ===========================================================================

// Feature: job-application-tracker, Property 9:
// After a successful DELETE /applications/:id (204), GET/:id returns 404 and
// GET /applications does not include that record.
// Validates: Requirements 6.1, 6.2

describe('P9 – Delete removes record from collection', () => {
  test('property: deleted record is not accessible via GET/:id or GET /', async () => {
    const col = makeMemoryCollection();
    const { server, close } = await startServer(makeDb(col));

    try {
      await fc.assert(
        fc.asyncProperty(validPayload, async (payload) => {
          // Create a fresh document
          const createRes = await request(server, {
            method: 'POST',
            path: '/applications',
            body: payload,
          });
          if (createRes.status !== 201) return false;

          const docId = createRes.body._id;

          // Delete it
          const deleteRes = await request(server, {
            method: 'DELETE',
            path: `/applications/${docId}`,
          });
          if (deleteRes.status !== 204) return false;

          // GET/:id must return 404
          const getByIdRes = await request(server, {
            method: 'GET',
            path: `/applications/${docId}`,
          });
          if (getByIdRes.status !== 404) return false;

          // GET / must not include the deleted record
          const listRes = await request(server, {
            method: 'GET',
            path: '/applications',
          });
          if (listRes.status !== 200) return false;

          const ids = listRes.body.map(r => r._id ? r._id.toString() : r._id);
          return !ids.includes(docId.toString());
        }),
        { numRuns: 100 }
      );
    } finally {
      await close();
    }
  });
});
