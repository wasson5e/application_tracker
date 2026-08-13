'use strict';

/**
 * Unit tests for api/src/config.js
 *
 * Strategy: isolate config.js from the real process environment by:
 *   1. Clearing the module cache before each test so loadConfig() re-runs.
 *   2. Mocking process.exit so the process does not actually terminate.
 *   3. Spying on process.stderr.write to capture error messages.
 */

describe('config – loadConfig()', () => {
  let originalEnv;
  let exitSpy;
  let stderrSpy;

  beforeEach(() => {
    // Snapshot the real environment so we can restore it after each test.
    originalEnv = { ...process.env };

    // Prevent process.exit from terminating the test runner.
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    // Capture stderr output without printing to the console.
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    // Remove the config module from the cache so each test gets a fresh load.
    jest.resetModules();
  });

  afterEach(() => {
    // Restore original environment and mocks.
    process.env = originalEnv;
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  // Helper that loads a fresh copy of config with the supplied env vars in place.
  function loadWithEnv(vars) {
    // Replace env entirely with the supplied vars (no inherited noise).
    process.env = { ...vars };
    const { loadConfig } = require('../../src/config');
    return loadConfig;
  }

  // ── Valid configuration ──────────────────────────────────────────────────────

  test('returns config object when all values are valid', () => {
    const loadConfig = loadWithEnv({
      API_PORT: '4000',
      MONGODB_URI: 'mongodb://localhost:27017',
      DB_NAME: 'test_db',
    });

    const config = loadConfig();

    expect(config).toEqual({
      port: 4000,
      mongodbUri: 'mongodb://localhost:27017',
      dbName: 'test_db',
      resumePath: '/data/resumes',
    });
    expect(exitSpy).not.toHaveBeenCalled();
  });

  test('accepts port 1 (minimum boundary)', () => {
    const loadConfig = loadWithEnv({
      API_PORT: '1',
      MONGODB_URI: 'mongodb://localhost:27017',
      DB_NAME: 'test_db',
    });

    const config = loadConfig();
    expect(config.port).toBe(1);
  });

  test('accepts port 65535 (maximum boundary)', () => {
    const loadConfig = loadWithEnv({
      API_PORT: '65535',
      MONGODB_URI: 'mongodb://localhost:27017',
      DB_NAME: 'test_db',
    });

    const config = loadConfig();
    expect(config.port).toBe(65535);
  });

  // ── Missing MONGODB_URI ─────────────────────────────────────────────────────

  test('exits with code 1 when MONGODB_URI is missing', () => {
    const loadConfig = loadWithEnv({
      API_PORT: '4000',
      // MONGODB_URI intentionally omitted
      DB_NAME: 'test_db',
    });

    expect(() => loadConfig()).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  test('writes MONGODB_URI key name to stderr when MONGODB_URI is missing', () => {
    const loadConfig = loadWithEnv({
      API_PORT: '4000',
      DB_NAME: 'test_db',
    });

    expect(() => loadConfig()).toThrow();

    const stderrOutput = stderrSpy.mock.calls.map(([msg]) => msg).join('');
    expect(stderrOutput).toContain('MONGODB_URI');
  });

  test('exits with code 1 when MONGODB_URI is an empty string', () => {
    const loadConfig = loadWithEnv({
      API_PORT: '4000',
      MONGODB_URI: '',
      DB_NAME: 'test_db',
    });

    expect(() => loadConfig()).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);

    const stderrOutput = stderrSpy.mock.calls.map(([msg]) => msg).join('');
    expect(stderrOutput).toContain('MONGODB_URI');
  });

  // ── Non-integer port ────────────────────────────────────────────────────────

  test('exits with code 1 when API_PORT is a non-integer string', () => {
    const loadConfig = loadWithEnv({
      API_PORT: 'abc',
      MONGODB_URI: 'mongodb://localhost:27017',
      DB_NAME: 'test_db',
    });

    expect(() => loadConfig()).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);

    const stderrOutput = stderrSpy.mock.calls.map(([msg]) => msg).join('');
    expect(stderrOutput).toContain('API_PORT');
  });

  test('exits with code 1 when API_PORT is a decimal number', () => {
    const loadConfig = loadWithEnv({
      API_PORT: '4000.5',
      MONGODB_URI: 'mongodb://localhost:27017',
      DB_NAME: 'test_db',
    });

    expect(() => loadConfig()).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);

    const stderrOutput = stderrSpy.mock.calls.map(([msg]) => msg).join('');
    expect(stderrOutput).toContain('API_PORT');
  });

  // ── Port out of range ───────────────────────────────────────────────────────

  test('exits with code 1 when API_PORT is 0 (below minimum)', () => {
    const loadConfig = loadWithEnv({
      API_PORT: '0',
      MONGODB_URI: 'mongodb://localhost:27017',
      DB_NAME: 'test_db',
    });

    expect(() => loadConfig()).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);

    const stderrOutput = stderrSpy.mock.calls.map(([msg]) => msg).join('');
    expect(stderrOutput).toContain('API_PORT');
  });

  test('exits with code 1 when API_PORT is 65536 (above maximum)', () => {
    const loadConfig = loadWithEnv({
      API_PORT: '65536',
      MONGODB_URI: 'mongodb://localhost:27017',
      DB_NAME: 'test_db',
    });

    expect(() => loadConfig()).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);

    const stderrOutput = stderrSpy.mock.calls.map(([msg]) => msg).join('');
    expect(stderrOutput).toContain('API_PORT');
  });

  test('exits with code 1 when API_PORT is missing', () => {
    const loadConfig = loadWithEnv({
      MONGODB_URI: 'mongodb://localhost:27017',
      DB_NAME: 'test_db',
    });

    expect(() => loadConfig()).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);

    const stderrOutput = stderrSpy.mock.calls.map(([msg]) => msg).join('');
    expect(stderrOutput).toContain('API_PORT');
  });

  // ── Multiple missing keys ───────────────────────────────────────────────────

  test('names all missing keys on stderr when multiple values are absent', () => {
    const loadConfig = loadWithEnv({
      // All three intentionally omitted
    });

    expect(() => loadConfig()).toThrow('process.exit called');

    const stderrOutput = stderrSpy.mock.calls.map(([msg]) => msg).join('');
    expect(stderrOutput).toContain('API_PORT');
    expect(stderrOutput).toContain('MONGODB_URI');
    expect(stderrOutput).toContain('DB_NAME');
  });
});
