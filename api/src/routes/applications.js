'use strict';

const { Router } = require('express');
const { ObjectId } = require('mongodb');
const { validateApplication, validateStatus, STATUS_VALUES } = require('../validation');
const { markGhostedApplications } = require('../ghostCheck');

/**
 * Returns an Express Router with all five application CRUD endpoints wired up.
 *
 * Using a factory keeps the db handle out of module-level state, which makes
 * the router easy to test in isolation by injecting a mock db object.
 *
 * @param {import('mongodb').Db} db - Connected MongoDB database handle
 * @returns {import('express').Router}
 */
function createRouter(db) {
  const router = Router();

  // Shorthand for the applications collection.
  const col = () => db.collection('applications');

  /**
   * Try to parse `id` as a MongoDB ObjectId.
   * Returns the ObjectId on success, or null when the string is malformed.
   *
   * @param {string} id
   * @returns {ObjectId|null}
   */
  function parseObjectId(id) {
    try {
      return new ObjectId(id);
    } catch (_) {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // POST /applications — create a new application
  // ---------------------------------------------------------------------------
  router.post('/', async (req, res) => {
    const body = req.body || {};

    // Validate required fields and enum/length constraints.
    const { valid, fields } = validateApplication(body, false);
    if (!valid) {
      return res.status(400).json({ error: 'Validation failed', fields });
    }

    // Build the document; forcibly set server-controlled fields.
    const doc = {
      company: body.company.trim(),
      jobTitle: body.jobTitle.trim(),
      jobDescription: body.jobDescription.trim(),
      jobLocation: body.jobLocation.trim(),
      workArrangement: body.workArrangement,
      payscale: body.payscale !== undefined && body.payscale !== null
        ? String(body.payscale)
        : null,
      notes: body.notes !== undefined && body.notes !== null
        ? String(body.notes)
        : null,
      mlMatch: body.mlMatch !== undefined && body.mlMatch !== null
        ? Number(body.mlMatch)
        : null,
      status: 'Applied',
      appliedAt: new Date(),
    };

    try {
      const result = await col().insertOne(doc);
      // insertOne mutates doc in place, adding _id.
      return res.status(201).json({ ...doc, _id: result.insertedId });
    } catch (err) {
      return res.status(503).json({
        error: 'Database unavailable. Please try again later.',
      });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /applications — list all applications, newest first
  // ---------------------------------------------------------------------------
  router.get('/', async (_req, res) => {
    try {
      // Run ghost check before returning results to ensure freshness
      await markGhostedApplications(db);

      const applications = await col()
        .find({})
        .sort({ appliedAt: -1 })
        .toArray();
      return res.status(200).json(applications);
    } catch (err) {
      return res.status(503).json({
        error: 'Database unavailable. Please try again later.',
      });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /applications/:id — get a single application
  // ---------------------------------------------------------------------------
  router.get('/:id', async (req, res) => {
    const oid = parseObjectId(req.params.id);
    if (!oid) {
      return res.status(404).json({ error: 'Application not found' });
    }

    try {
      const application = await col().findOne({ _id: oid });
      if (!application) {
        return res.status(404).json({ error: 'Application not found' });
      }
      return res.status(200).json(application);
    } catch (err) {
      return res.status(503).json({
        error: 'Database unavailable. Please try again later.',
      });
    }
  });

  // ---------------------------------------------------------------------------
  // PUT /applications/:id — update an existing application
  // ---------------------------------------------------------------------------
  router.put('/:id', async (req, res) => {
    const oid = parseObjectId(req.params.id);
    if (!oid) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const body = req.body || {};

    // Strip appliedAt — it must never be modified (Requirement 5.5).
    const { appliedAt: _ignored, ...updateFields } = body;

    // Validate the supplied fields as a partial update.
    const { valid, fields } = validateApplication(updateFields, true);

    // Validate status enum if supplied (Requirement 3.4).
    if ('status' in updateFields && !validateStatus(updateFields.status)) {
      fields.status = `Must be one of: ${STATUS_VALUES.join(', ')}.`;
    }

    if (!valid || Object.keys(fields).length > 0) {
      return res.status(400).json({ error: 'Validation failed', fields });
    }

    try {
      const result = await col().findOneAndUpdate(
        { _id: oid },
        { $set: updateFields },
        { returnDocument: 'after' }
      );

      // findOneAndUpdate returns null when no document matched.
      if (!result) {
        return res.status(404).json({ error: 'Application not found' });
      }

      return res.status(200).json(result);
    } catch (err) {
      return res.status(503).json({
        error: 'Database unavailable. Please try again later.',
      });
    }
  });

  // ---------------------------------------------------------------------------
  // DELETE /applications/:id — permanently remove an application
  // ---------------------------------------------------------------------------
  router.delete('/:id', async (req, res) => {
    const oid = parseObjectId(req.params.id);
    if (!oid) {
      return res.status(404).json({ error: 'Application not found' });
    }

    try {
      const result = await col().deleteOne({ _id: oid });
      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Application not found' });
      }
      return res.status(204).send();
    } catch (err) {
      return res.status(503).json({
        error: 'Database unavailable. Please try again later.',
      });
    }
  });

  return router;
}

module.exports = { createRouter };
