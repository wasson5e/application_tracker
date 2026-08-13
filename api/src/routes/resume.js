'use strict';

const { Router } = require('express');
const { ObjectId } = require('mongodb');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

/**
 * Sanitize a string for use as a folder name.
 * Replaces characters that are problematic in file paths.
 * @param {string} name
 * @returns {string}
 */
function sanitizeFolderName(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns an Express Router for resume file upload.
 *
 * POST /applications/:id/resume
 *   - Accepts a multipart file upload (field name: "resume")
 *   - Looks up the application by ID to get company + jobTitle
 *   - Creates {RESUME_PATH}/{company}/{jobTitle}/ if it doesn't exist
 *   - Saves the uploaded file into that folder
 *   - Updates the application document with the resume file path
 *
 * @param {import('mongodb').Db} db - Connected MongoDB database handle
 * @param {string} resumePath - Base path for resume storage
 * @returns {import('express').Router}
 */
function createResumeRouter(db, resumePath) {
  const router = Router();

  const col = () => db.collection('applications');

  // Configure multer for temporary storage (we'll move the file after)
  const upload = multer({ dest: path.join(resumePath, '.tmp') });

  /**
   * Try to parse `id` as a MongoDB ObjectId.
   */
  function parseObjectId(id) {
    try {
      return new ObjectId(id);
    } catch (_) {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // POST /applications/:id/resume — upload a resume for an application
  // ---------------------------------------------------------------------------
  router.post('/:id/resume', upload.single('resume'), async (req, res) => {
    const oid = parseObjectId(req.params.id);
    if (!oid) {
      // Clean up uploaded temp file
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Application not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Field name must be "resume".' });
    }

    try {
      // Look up the application to get company and job title
      const application = await col().findOne({ _id: oid });
      if (!application) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: 'Application not found' });
      }

      const companyFolder = sanitizeFolderName(application.company);
      const jobTitleFolder = sanitizeFolderName(application.jobTitle);
      const targetDir = path.join(resumePath, companyFolder, jobTitleFolder);

      // Create the directory structure if it doesn't exist
      fs.mkdirSync(targetDir, { recursive: true });

      // Determine final file name (preserve original extension)
      const originalName = req.file.originalname;
      const targetPath = path.join(targetDir, originalName);

      // Move the file from temp to final location
      fs.renameSync(req.file.path, targetPath);

      // Store the relative path in the application document
      const relativePath = path.join(companyFolder, jobTitleFolder, originalName);
      await col().updateOne(
        { _id: oid },
        { $set: { resumePath: relativePath } }
      );

      return res.status(200).json({
        message: 'Resume uploaded successfully',
        resumePath: relativePath,
      });
    } catch (err) {
      // Clean up temp file on error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(503).json({
        error: 'Failed to upload resume. Please try again later.',
      });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /applications/:id/resume — download the resume file
  // ---------------------------------------------------------------------------
  router.get('/:id/resume', async (req, res) => {
    const oid = parseObjectId(req.params.id);
    if (!oid) {
      return res.status(404).json({ error: 'Application not found' });
    }

    try {
      const application = await col().findOne({ _id: oid });
      if (!application || !application.resumePath) {
        return res.status(404).json({ error: 'No resume found for this application' });
      }

      const filePath = path.join(resumePath, application.resumePath);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Resume file not found on disk' });
      }

      return res.download(filePath);
    } catch (err) {
      return res.status(503).json({
        error: 'Failed to retrieve resume. Please try again later.',
      });
    }
  });

  return router;
}

module.exports = { createResumeRouter };
