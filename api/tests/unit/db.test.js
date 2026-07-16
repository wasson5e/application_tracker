'use strict';

/**
 * Unit tests for api/src/db.js
 *
 * Strategy:
 *   - Mock `mongodb`'s MongoClient.connect to control success/failure paths.
 *   - Spy on process.stderr.write to capture error output.
 *   - Mock process.exit so the test runner is not terminated.
 */

describe('db – connect()', () => {
  let exitSpy;
  let stderrSpy;

  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    jest.resetModules();
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
    jest.restoreAllMocks();
  });

  // Helper: build a mock mongodb module that rejects MongoClient.connect
  function mockMongoFailure() {
    jest.mock('mongodb', () => ({
      MongoClient: {
        connect: jest.fn().mockRejectedValue(new Error('connection refused')),
      },
    }));
    return require('../../src/db');
  }

  // Helper: build a mock mongodb module for the success path
  function mockMongoSuccess() {
    jest.mock('mongodb', () => {
      const mockCreateIndex = jest.fn().mockResolvedValue({});
      const mockCollection = jest.fn().mockReturnValue({ createIndex: mockCreateIndex });
      const mockDb = jest.fn().mockReturnValue({ collection: mockCollection });
      const mockClient = { db: mockDb };
      return {
        MongoClient: {
          connect: jest.fn().mockResolvedValue(mockClient),
        },
        // expose the inner mocks so tests can assert on them
        _mocks: { mockCreateIndex, mockCollection, mockDb, mockClient },
      };
    });
    return require('../../src/db');
  }

  // ── Failure path ─────────────────────────────────────────────────────────────

  test('exits with code 1 when MongoClient.connect throws', async () => {
    const { connect } = mockMongoFailure();

    await expect(connect('mongodb://localhost:27017', 'mydb')).rejects.toThrow(
      'process.exit called'
    );

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  test('writes host to stderr when MongoClient.connect throws', async () => {
    const { connect } = mockMongoFailure();

    await expect(connect('mongodb://db.example.com:27017', 'appdb')).rejects.toThrow(
      'process.exit called'
    );

    const stderrOutput = stderrSpy.mock.calls.map(([msg]) => msg).join('');
    expect(stderrOutput).toContain('db.example.com');
  });

  test('writes port to stderr when MongoClient.connect throws', async () => {
    const { connect } = mockMongoFailure();

    await expect(connect('mongodb://localhost:27017', 'appdb')).rejects.toThrow(
      'process.exit called'
    );

    const stderrOutput = stderrSpy.mock.calls.map(([msg]) => msg).join('');
    expect(stderrOutput).toContain('27017');
  });

  test('writes database name to stderr when MongoClient.connect throws', async () => {
    const { connect } = mockMongoFailure();

    await expect(connect('mongodb://localhost:27017', 'tracker_db')).rejects.toThrow(
      'process.exit called'
    );

    const stderrOutput = stderrSpy.mock.calls.map(([msg]) => msg).join('');
    expect(stderrOutput).toContain('tracker_db');
  });

  test('includes host, port, and dbName in stderr output', async () => {
    const { connect } = mockMongoFailure();

    await expect(connect('mongodb://mongo.internal:27777', 'prod_db')).rejects.toThrow(
      'process.exit called'
    );

    const stderrOutput = stderrSpy.mock.calls.map(([msg]) => msg).join('');
    expect(stderrOutput).toContain('mongo.internal');
    expect(stderrOutput).toContain('27777');
    expect(stderrOutput).toContain('prod_db');
  });

  // ── Success path ─────────────────────────────────────────────────────────────

  test('returns the database handle on successful connection', async () => {
    const { connect } = mockMongoSuccess();

    const db = await connect('mongodb://localhost:27017', 'mydb');

    expect(db).toBeDefined();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  test('creates the { appliedAt: -1 } index on the applications collection', async () => {
    const { connect } = mockMongoSuccess();
    const mongodb = require('mongodb');

    await connect('mongodb://localhost:27017', 'mydb');

    const { mockCreateIndex } = mongodb._mocks;
    expect(mockCreateIndex).toHaveBeenCalledWith({ appliedAt: -1 });
  });

  test('creates the { status: 1 } index on the applications collection', async () => {
    const { connect } = mockMongoSuccess();
    const mongodb = require('mongodb');

    await connect('mongodb://localhost:27017', 'mydb');

    const { mockCreateIndex } = mongodb._mocks;
    expect(mockCreateIndex).toHaveBeenCalledWith({ status: 1 });
  });

  test('passes serverSelectionTimeoutMS: 30000 to MongoClient.connect', async () => {
    const { connect } = mockMongoSuccess();
    const mongodb = require('mongodb');

    await connect('mongodb://localhost:27017', 'mydb');

    expect(mongodb.MongoClient.connect).toHaveBeenCalledWith(
      'mongodb://localhost:27017',
      expect.objectContaining({ serverSelectionTimeoutMS: 30000 })
    );
  });
});
