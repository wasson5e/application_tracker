'use strict';

/**
 * Unit tests for api/src/routes/applications.js
 *
 * The db handle is replaced by a lightweight mock so no real MongoDB
 * connection is needed.  Each test builds the mock collection methods it
 * needs and asserts on the HTTP response produced by the router.
 */

const { createRouter } = require('../../src/routes/applications');

// ---------------------------------------------------------------------------
// Minimal Express-like request/response helpers
// ---------------------------------------------------------------------------

/**
 * Builds a fake Express req object.
 * @param {object} opts
 * @param {object} [opts.params]
 * @param {object} [opts.body]
 * @returns {object}
 */
function makeReq({ params = {}, body = {} } = {}) {
  return { params, body };
}

/**
 * Builds a spy-able fake Express res object.
 * Captures the last status code and JSON body sent.
 * @returns {{ status: Function, json: Function, send: Function, _status: number|null, _body: any }}
 */
function makeRes() {
  const res = {
    _status: null,
    _body: undefined,
    _sent: false,
  };

  res.status = (code) => {
    res._status = code;
    return res; // allow chaining (.status(x).json(y))
  };

  res.json = (body) => {
    res._body = body;
    res._sent = true;
    return res;
  };

  res.send = () => {
    res._sent = true;
    return res;
  };

  return res;
}

// ---------------------------------------------------------------------------
// Factory: build a minimal mock db from a collection implementation
// ---------------------------------------------------------------------------

/**
 * @param {object} collectionImpl  – object whose methods stub the MongoDB
 *                                   Collection API used by the router
 * @returns {{ collection: Function }}
 */
function makeDb(collectionImpl) {
  return {
    collection: (_name) => collectionImpl,
  };
}

// ---------------------------------------------------------------------------
// Valid base payload used across multiple tests
// ---------------------------------------------------------------------------
const VALID_PAYLOAD = {
  company: 'Acme Corp',
  jobTitle: 'Software Engineer',
  jobDescription: 'Build cool things.',
  jobLocation: 'Remote, USA',
  workArrangement: 'Remote',
  payscale: '$120,000',
  notes: 'Applied via LinkedIn',
};

// ---------------------------------------------------------------------------
// Helper: extract the handler for a given method from the router's stack.
// createRouter returns a Router whose stack has Route objects we can call
// directly without spinning up an HTTP server.
// ---------------------------------------------------------------------------

/**
 * Invoke a route handler by looking it up in the router's layer stack.
 *
 * @param {object}   router
 * @param {string}   method  – 'get', 'post', 'put', 'delete'
 * @param {string}   path    – route path to match (e.g. '/', '/:id')
 * @param {object}   req
 * @param {object}   res
 * @returns {Promise<void>}
 */
async function callRoute(router, method, path, req, res) {
  // Walk the router's layer stack to find the matching route layer.
  for (const layer of router.stack) {
    if (!layer.route) continue;
    const route = layer.route;
    if (route.path === path && route.methods[method.toLowerCase()]) {
      // Find the handler function(s) for this method.
      for (const rl of route.stack) {
        if (rl.method === method.toLowerCase()) {
          await rl.handle(req, res, (err) => {
            if (err) throw err;
          });
          return;
        }
      }
    }
  }
  throw new Error(`No ${method.toUpperCase()} handler found for path "${path}"`);
}

// ===========================================================================
// POST /applications
// ===========================================================================

describe('POST /applications', () => {
  test('returns 201 with created document on valid payload', async () => {
    const insertedId = 'abc123objectid';
    const collection = {
      insertOne: jest.fn(async (doc) => {
        doc._id = insertedId;
        return { insertedId };
      }),
    };
    const router = createRouter(makeDb(collection));
    const req = makeReq({ body: { ...VALID_PAYLOAD } });
    const res = makeRes();

    await callRoute(router, 'post', '/', req, res);

    expect(res._status).toBe(201);
    expect(res._body.company).toBe('Acme Corp');
    expect(res._body.status).toBe('Applied');
    expect(res._body.appliedAt).toBeInstanceOf(Date);
    expect(res._body._id).toBe(insertedId);
    expect(collection.insertOne).toHaveBeenCalledTimes(1);
  });

  test('sets status to "Applied" and ignores any status in the body', async () => {
    const collection = {
      insertOne: jest.fn(async (doc) => ({ insertedId: 'x' })),
    };
    const router = createRouter(makeDb(collection));
    const req = makeReq({ body: { ...VALID_PAYLOAD, status: 'Withdrawn' } });
    const res = makeRes();

    await callRoute(router, 'post', '/', req, res);

    // status from the request body should be ignored
    const inserted = collection.insertOne.mock.calls[0][0];
    expect(inserted.status).toBe('Applied');
  });

  test('returns 400 with field errors when required fields are missing', async () => {
    const collection = { insertOne: jest.fn() };
    const router = createRouter(makeDb(collection));
    const req = makeReq({ body: { company: '', workArrangement: 'Remote' } });
    const res = makeRes();

    await callRoute(router, 'post', '/', req, res);

    expect(res._status).toBe(400);
    expect(res._body.error).toBe('Validation failed');
    expect(res._body.fields).toHaveProperty('company');
    expect(res._body.fields).toHaveProperty('jobTitle');
    expect(res._body.fields).toHaveProperty('jobDescription');
    expect(res._body.fields).toHaveProperty('jobLocation');
    expect(collection.insertOne).not.toHaveBeenCalled();
  });

  test('returns 400 when workArrangement is invalid', async () => {
    const collection = { insertOne: jest.fn() };
    const router = createRouter(makeDb(collection));
    const req = makeReq({
      body: { ...VALID_PAYLOAD, workArrangement: 'Spaceship' },
    });
    const res = makeRes();

    await callRoute(router, 'post', '/', req, res);

    expect(res._status).toBe(400);
    expect(res._body.fields).toHaveProperty('workArrangement');
  });

  test('returns 503 when insertOne throws', async () => {
    const collection = {
      insertOne: jest.fn().mockRejectedValue(new Error('connection refused')),
    };
    const router = createRouter(makeDb(collection));
    const req = makeReq({ body: { ...VALID_PAYLOAD } });
    const res = makeRes();

    await callRoute(router, 'post', '/', req, res);

    expect(res._status).toBe(503);
    expect(res._body.error).toMatch(/Database unavailable/);
  });
});

// ===========================================================================
// GET /applications
// ===========================================================================

describe('GET /applications', () => {
  test('returns 200 with array from collection sorted by appliedAt desc', async () => {
    const docs = [
      { _id: '1', company: 'B', appliedAt: new Date('2024-02-01') },
      { _id: '2', company: 'A', appliedAt: new Date('2024-01-01') },
    ];
    const collection = {
      find: jest.fn(() => ({
        sort: jest.fn(() => ({ toArray: jest.fn(async () => docs) })),
      })),
      updateMany: jest.fn(async () => ({ modifiedCount: 0 })),
    };
    const router = createRouter(makeDb(collection));
    const req = makeReq();
    const res = makeRes();

    await callRoute(router, 'get', '/', req, res);

    expect(res._status).toBe(200);
    expect(res._body).toEqual(docs);
    expect(collection.find).toHaveBeenCalledWith({});
  });

  test('returns 503 when find throws', async () => {
    const collection = {
      find: jest.fn(() => ({
        sort: jest.fn(() => ({
          toArray: jest.fn().mockRejectedValue(new Error('db down')),
        })),
      })),
      updateMany: jest.fn(async () => ({ modifiedCount: 0 })),
    };
    const router = createRouter(makeDb(collection));
    const req = makeReq();
    const res = makeRes();

    await callRoute(router, 'get', '/', req, res);

    expect(res._status).toBe(503);
  });
});

// ===========================================================================
// GET /applications/:id
// ===========================================================================

describe('GET /applications/:id', () => {
  test('returns 200 with document when found', async () => {
    // A real 24-char hex string is required for ObjectId parsing.
    const id = '6648e4b6f4e2a1b2c3d4e5f6';
    const doc = { _id: id, company: 'Acme' };
    const collection = {
      findOne: jest.fn(async () => doc),
    };
    const router = createRouter(makeDb(collection));
    const req = makeReq({ params: { id } });
    const res = makeRes();

    await callRoute(router, 'get', '/:id', req, res);

    expect(res._status).toBe(200);
    expect(res._body).toEqual(doc);
  });

  test('returns 404 for a malformed ObjectId', async () => {
    const collection = { findOne: jest.fn() };
    const router = createRouter(makeDb(collection));
    const req = makeReq({ params: { id: 'not-an-objectid' } });
    const res = makeRes();

    await callRoute(router, 'get', '/:id', req, res);

    expect(res._status).toBe(404);
    expect(res._body.error).toBe('Application not found');
    expect(collection.findOne).not.toHaveBeenCalled();
  });

  test('returns 404 when document is not found', async () => {
    const id = '6648e4b6f4e2a1b2c3d4e5f6';
    const collection = { findOne: jest.fn(async () => null) };
    const router = createRouter(makeDb(collection));
    const req = makeReq({ params: { id } });
    const res = makeRes();

    await callRoute(router, 'get', '/:id', req, res);

    expect(res._status).toBe(404);
    expect(res._body.error).toBe('Application not found');
  });

  test('returns 503 when findOne throws', async () => {
    const id = '6648e4b6f4e2a1b2c3d4e5f6';
    const collection = {
      findOne: jest.fn().mockRejectedValue(new Error('db down')),
    };
    const router = createRouter(makeDb(collection));
    const req = makeReq({ params: { id } });
    const res = makeRes();

    await callRoute(router, 'get', '/:id', req, res);

    expect(res._status).toBe(503);
  });
});

// ===========================================================================
// PUT /applications/:id
// ===========================================================================

describe('PUT /applications/:id', () => {
  const id = '6648e4b6f4e2a1b2c3d4e5f6';

  test('returns 200 with updated document on valid partial update', async () => {
    const updatedDoc = { _id: id, company: 'NewCo', jobTitle: 'Dev' };
    const collection = {
      findOneAndUpdate: jest.fn(async () => updatedDoc),
    };
    const router = createRouter(makeDb(collection));
    const req = makeReq({
      params: { id },
      body: { company: 'NewCo' },
    });
    const res = makeRes();

    await callRoute(router, 'put', '/:id', req, res);

    expect(res._status).toBe(200);
    expect(res._body).toEqual(updatedDoc);
  });

  test('strips appliedAt from the update payload', async () => {
    const collection = {
      findOneAndUpdate: jest.fn(async () => ({ _id: id })),
    };
    const router = createRouter(makeDb(collection));
    const req = makeReq({
      params: { id },
      body: { company: 'Acme', appliedAt: new Date('2000-01-01') },
    });
    const res = makeRes();

    await callRoute(router, 'put', '/:id', req, res);

    const setArg = collection.findOneAndUpdate.mock.calls[0][1].$set;
    expect(setArg).not.toHaveProperty('appliedAt');
    expect(setArg).toHaveProperty('company', 'Acme');
  });

  test('returns 400 when an explicitly-provided required field is empty', async () => {
    const collection = { findOneAndUpdate: jest.fn() };
    const router = createRouter(makeDb(collection));
    const req = makeReq({
      params: { id },
      body: { company: '' },
    });
    const res = makeRes();

    await callRoute(router, 'put', '/:id', req, res);

    expect(res._status).toBe(400);
    expect(res._body.fields).toHaveProperty('company');
    expect(collection.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('returns 404 for a malformed ObjectId', async () => {
    const collection = { findOneAndUpdate: jest.fn() };
    const router = createRouter(makeDb(collection));
    const req = makeReq({
      params: { id: 'bad-id' },
      body: { company: 'Acme' },
    });
    const res = makeRes();

    await callRoute(router, 'put', '/:id', req, res);

    expect(res._status).toBe(404);
    expect(collection.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('returns 404 when document does not exist', async () => {
    const collection = {
      findOneAndUpdate: jest.fn(async () => null),
    };
    const router = createRouter(makeDb(collection));
    const req = makeReq({
      params: { id },
      body: { company: 'Acme' },
    });
    const res = makeRes();

    await callRoute(router, 'put', '/:id', req, res);

    expect(res._status).toBe(404);
  });

  test('returns 503 when findOneAndUpdate throws', async () => {
    const collection = {
      findOneAndUpdate: jest.fn().mockRejectedValue(new Error('db down')),
    };
    const router = createRouter(makeDb(collection));
    const req = makeReq({
      params: { id },
      body: { company: 'Acme' },
    });
    const res = makeRes();

    await callRoute(router, 'put', '/:id', req, res);

    expect(res._status).toBe(503);
  });
});

// ===========================================================================
// DELETE /applications/:id
// ===========================================================================

describe('DELETE /applications/:id', () => {
  const id = '6648e4b6f4e2a1b2c3d4e5f6';

  test('returns 204 when document is successfully deleted', async () => {
    const collection = {
      deleteOne: jest.fn(async () => ({ deletedCount: 1 })),
    };
    const router = createRouter(makeDb(collection));
    const req = makeReq({ params: { id } });
    const res = makeRes();

    await callRoute(router, 'delete', '/:id', req, res);

    expect(res._status).toBe(204);
    expect(res._sent).toBe(true);
  });

  test('returns 404 when document does not exist', async () => {
    const collection = {
      deleteOne: jest.fn(async () => ({ deletedCount: 0 })),
    };
    const router = createRouter(makeDb(collection));
    const req = makeReq({ params: { id } });
    const res = makeRes();

    await callRoute(router, 'delete', '/:id', req, res);

    expect(res._status).toBe(404);
    expect(res._body.error).toBe('Application not found');
  });

  test('returns 404 for a malformed ObjectId', async () => {
    const collection = { deleteOne: jest.fn() };
    const router = createRouter(makeDb(collection));
    const req = makeReq({ params: { id: 'not-valid' } });
    const res = makeRes();

    await callRoute(router, 'delete', '/:id', req, res);

    expect(res._status).toBe(404);
    expect(collection.deleteOne).not.toHaveBeenCalled();
  });

  test('returns 503 when deleteOne throws', async () => {
    const collection = {
      deleteOne: jest.fn().mockRejectedValue(new Error('db down')),
    };
    const router = createRouter(makeDb(collection));
    const req = makeReq({ params: { id } });
    const res = makeRes();

    await callRoute(router, 'delete', '/:id', req, res);

    expect(res._status).toBe(503);
  });
});
