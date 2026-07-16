'use strict';

const {
  WORK_ARRANGEMENTS,
  STATUS_VALUES,
  validateApplication,
  validateStatus,
} = require('../../src/validation');

// ─── Constants ────────────────────────────────────────────────────────────────

describe('WORK_ARRANGEMENTS', () => {
  test('contains exactly Remote, Hybrid, On-site', () => {
    expect(WORK_ARRANGEMENTS).toEqual(['Remote', 'Hybrid', 'On-site']);
  });
});

describe('STATUS_VALUES', () => {
  test('contains exactly the seven Application_Status values', () => {
    expect(STATUS_VALUES).toEqual([
      'Applied',
      'Phone Screen',
      'Interview',
      'Offer',
      'Moving Forward',
      'Passed On',
      'Withdrawn',
    ]);
  });
});

// ─── validateStatus ───────────────────────────────────────────────────────────

describe('validateStatus()', () => {
  test.each(STATUS_VALUES)('returns true for valid status "%s"', (status) => {
    expect(validateStatus(status)).toBe(true);
  });

  test('returns false for an unknown string', () => {
    expect(validateStatus('Rejected')).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(validateStatus('')).toBe(false);
  });

  test('returns false for null', () => {
    expect(validateStatus(null)).toBe(false);
  });

  test('returns false for undefined', () => {
    expect(validateStatus(undefined)).toBe(false);
  });

  test('is case-sensitive (lowercase not accepted)', () => {
    expect(validateStatus('applied')).toBe(false);
    expect(validateStatus('interview')).toBe(false);
  });

  test('returns false for a number', () => {
    expect(validateStatus(1)).toBe(false);
  });
});

// ─── validateApplication – POST (isUpdate = false) ───────────────────────────

describe('validateApplication() – create (isUpdate = false)', () => {
  /** A fully valid body used as the baseline. */
  const validBody = {
    company: 'Acme Corp',
    jobTitle: 'Software Engineer',
    jobDescription: 'Build things.',
    jobLocation: 'New York, NY',
    workArrangement: 'Remote',
  };

  test('returns valid:true for a complete, correct body', () => {
    const result = validateApplication(validBody);
    expect(result.valid).toBe(true);
    expect(result.fields).toEqual({});
  });

  // ── Required-field presence ────────────────────────────────────────────────

  const requiredFields = [
    'company',
    'jobTitle',
    'jobDescription',
    'jobLocation',
    'workArrangement',
  ];

  test.each(requiredFields)(
    'returns valid:false and names "%s" when it is missing',
    (field) => {
      const body = { ...validBody };
      delete body[field];
      const result = validateApplication(body);
      expect(result.valid).toBe(false);
      expect(result.fields).toHaveProperty(field);
    },
  );

  test.each(requiredFields)(
    'returns valid:false and names "%s" when it is an empty string',
    (field) => {
      const body = { ...validBody, [field]: '' };
      const result = validateApplication(body);
      expect(result.valid).toBe(false);
      expect(result.fields).toHaveProperty(field);
    },
  );

  test.each(requiredFields)(
    'returns valid:false and names "%s" when it is null',
    (field) => {
      const body = { ...validBody, [field]: null };
      const result = validateApplication(body);
      expect(result.valid).toBe(false);
      expect(result.fields).toHaveProperty(field);
    },
  );

  test.each(requiredFields)(
    'returns valid:false and names "%s" when it is undefined',
    (field) => {
      const body = { ...validBody, [field]: undefined };
      const result = validateApplication(body);
      expect(result.valid).toBe(false);
      expect(result.fields).toHaveProperty(field);
    },
  );

  test.each(requiredFields)(
    'returns valid:false and names "%s" when it is whitespace only',
    (field) => {
      const body = { ...validBody, [field]: '   ' };
      const result = validateApplication(body);
      expect(result.valid).toBe(false);
      expect(result.fields).toHaveProperty(field);
    },
  );

  test('names all five required fields when body is empty', () => {
    const result = validateApplication({});
    expect(result.valid).toBe(false);
    for (const field of requiredFields) {
      expect(result.fields).toHaveProperty(field);
    }
  });

  // ── workArrangement enum ───────────────────────────────────────────────────

  test.each(WORK_ARRANGEMENTS)(
    'accepts valid workArrangement "%s"',
    (wa) => {
      const body = { ...validBody, workArrangement: wa };
      const result = validateApplication(body);
      expect(result.valid).toBe(true);
    },
  );

  test('rejects workArrangement not in the allowed set', () => {
    const body = { ...validBody, workArrangement: 'WFH' };
    const result = validateApplication(body);
    expect(result.valid).toBe(false);
    expect(result.fields).toHaveProperty('workArrangement');
  });

  test('rejects workArrangement with wrong casing ("remote")', () => {
    const body = { ...validBody, workArrangement: 'remote' };
    const result = validateApplication(body);
    expect(result.valid).toBe(false);
    expect(result.fields).toHaveProperty('workArrangement');
  });

  test('rejects workArrangement that is an empty string', () => {
    const body = { ...validBody, workArrangement: '' };
    const result = validateApplication(body);
    expect(result.valid).toBe(false);
    // Flagged as missing (required + empty), not as wrong enum value
    expect(result.fields).toHaveProperty('workArrangement');
  });

  // ── payscale length ────────────────────────────────────────────────────────

  test('accepts payscale of exactly 500 characters', () => {
    const body = { ...validBody, payscale: 'x'.repeat(500) };
    const result = validateApplication(body);
    expect(result.valid).toBe(true);
  });

  test('rejects payscale of 501 characters', () => {
    const body = { ...validBody, payscale: 'x'.repeat(501) };
    const result = validateApplication(body);
    expect(result.valid).toBe(false);
    expect(result.fields).toHaveProperty('payscale');
  });

  test('accepts payscale that is null (optional field absent)', () => {
    const body = { ...validBody, payscale: null };
    const result = validateApplication(body);
    expect(result.valid).toBe(true);
  });

  test('accepts payscale that is undefined (optional field absent)', () => {
    const body = { ...validBody };
    // payscale is not set at all
    const result = validateApplication(body);
    expect(result.valid).toBe(true);
  });

  test('accepts payscale of 0 characters (empty string is valid for optional field)', () => {
    const body = { ...validBody, payscale: '' };
    const result = validateApplication(body);
    expect(result.valid).toBe(true);
  });

  // ── Optional fields (notes) ────────────────────────────────────────────────

  test('accepts body that includes optional notes field', () => {
    const body = { ...validBody, notes: 'Follow up on Monday.' };
    const result = validateApplication(body);
    expect(result.valid).toBe(true);
  });

  test('returns correct shape { valid, fields } on success', () => {
    const result = validateApplication(validBody);
    expect(result).toHaveProperty('valid', true);
    expect(result).toHaveProperty('fields');
    expect(typeof result.fields).toBe('object');
  });

  test('fields values are strings on failure', () => {
    const body = { ...validBody, company: '' };
    const result = validateApplication(body);
    expect(typeof result.fields.company).toBe('string');
  });
});

// ─── validateApplication – PUT (isUpdate = true) ─────────────────────────────

describe('validateApplication() – update (isUpdate = true)', () => {
  const validBody = {
    company: 'Acme Corp',
    jobTitle: 'Software Engineer',
    jobDescription: 'Build things.',
    jobLocation: 'New York, NY',
    workArrangement: 'Remote',
  };

  test('returns valid:true for a complete body', () => {
    const result = validateApplication(validBody, true);
    expect(result.valid).toBe(true);
  });

  test('returns valid:true for a partial body that omits required fields', () => {
    const result = validateApplication({ jobTitle: 'Senior Engineer' }, true);
    expect(result.valid).toBe(true);
  });

  test('returns valid:false when an explicitly-supplied required field is empty', () => {
    const result = validateApplication({ company: '' }, true);
    expect(result.valid).toBe(false);
    expect(result.fields).toHaveProperty('company');
  });

  test('returns valid:false when an explicitly-supplied required field is null', () => {
    const result = validateApplication({ jobTitle: null }, true);
    expect(result.valid).toBe(false);
    expect(result.fields).toHaveProperty('jobTitle');
  });

  test('returns valid:false for invalid workArrangement when supplied', () => {
    const result = validateApplication({ workArrangement: 'WFH' }, true);
    expect(result.valid).toBe(false);
    expect(result.fields).toHaveProperty('workArrangement');
  });

  test('accepts valid workArrangement in partial update', () => {
    const result = validateApplication({ workArrangement: 'Hybrid' }, true);
    expect(result.valid).toBe(true);
  });

  test('rejects payscale > 500 chars in partial update', () => {
    const result = validateApplication({ payscale: 'x'.repeat(501) }, true);
    expect(result.valid).toBe(false);
    expect(result.fields).toHaveProperty('payscale');
  });

  test('accepts payscale of exactly 500 chars in partial update', () => {
    const result = validateApplication({ payscale: 'x'.repeat(500) }, true);
    expect(result.valid).toBe(true);
  });

  test('ignores appliedAt field without error', () => {
    const result = validateApplication({ appliedAt: new Date() }, true);
    expect(result.valid).toBe(true);
  });
});
