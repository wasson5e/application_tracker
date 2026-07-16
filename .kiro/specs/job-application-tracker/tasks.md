# Implementation Plan: Job Application Tracker

## Overview

Build the full Job Application Tracker stack: a Node.js/Express REST API, a vanilla HTML/JS/CSS frontend served by Nginx, a MongoDB database, and Docker Compose orchestration wiring all three together. Tasks are ordered so that foundational infrastructure (config, DB, validation) is in place before route handlers and UI layers that depend on it.

## Tasks

- [x] 1. Project scaffolding and configuration
  - Create the top-level project directory structure: `api/`, `ui/`, and root-level config files
  - Create `.env.example` documenting all required keys (`API_PORT`, `MONGODB_URI`, `DB_NAME`, `UI_PORT`) with representative example values
  - Create `.env` with working local defaults (copies `.env.example` with real values for local dev)
  - Create root-level `.gitignore` excluding `.env`, `node_modules/`, and build artifacts
  - **Requirement**: 9.4, 10.1

- [x] 2. API — project setup and config validation
  - Initialize `api/package.json` with dependencies: `express`, `mongodb`, `dotenv`, `morgan` and dev dependencies: `jest`, `fast-check`
  - Create `api/src/config.js` that reads `API_PORT`, `MONGODB_URI`, `DB_NAME` from `process.env` (with `dotenv` fallback), validates presence and types (port must be integer 1–65535, URI must be non-empty string), writes the named missing/invalid key to `stderr`, and calls `process.exit(1)` on failure
  - Write unit tests in `api/tests/unit/config.test.js` covering: valid config loads successfully, missing `MONGODB_URI` exits with code 1 and names the key on stderr, non-integer port exits with code 1, port out of range exits with code 1
  - **Requirement**: 9.1, 9.2, 9.3

- [x] 3. API — MongoDB connection module
  - Create `api/src/db.js` that exports a `connect(uri, dbName)` function calling `MongoClient.connect` with `serverSelectionTimeoutMS: 30000`
  - On successful connection return the database handle; on failure log a message to `stderr` including the configured host, port, and database name, then call `process.exit(1)`
  - Create the `{ appliedAt: -1 }` and `{ status: 1 }` indexes on the `applications` collection at startup
  - Write unit tests in `api/tests/unit/db.test.js`: mock `MongoClient.connect` to throw and assert stderr output contains host/port/dbName and process exits with code 1
  - **Requirement**: 8.2, 8.3, 8.4

- [x] 4. API — validation helpers
  - Create `api/src/validation.js` exporting:
    - `validateApplication(body, isUpdate)` — checks required fields (`company`, `jobTitle`, `jobDescription`, `jobLocation`, `workArrangement`), validates `workArrangement` ∈ `{Remote, Hybrid, On-site}`, validates `payscale` ≤ 500 chars; returns `{ valid, fields }` where `fields` maps each invalid field name to a reason string
    - `validateStatus(value)` — checks value is one of the seven `Application_Status` enum values
    - `WORK_ARRANGEMENTS` and `STATUS_VALUES` constant arrays
  - Write unit tests in `api/tests/unit/validation.test.js` covering all field combinations including edge cases (empty string, null, undefined, wrong enum values, payscale at 500 chars and 501 chars)
  - **Requirement**: 1.4, 1.7, 3.4, 5.6, 7.2, 7.5

- [x] 5. API — route handlers
  - Create `api/src/routes/applications.js` with Express Router implementing all five endpoints:
    - `POST /applications` — validate, set `status = "Applied"` and `appliedAt = new Date()`, insert into `applications` collection, return 201 with created document
    - `GET /applications` — find all, sort `{ appliedAt: -1 }`, return 200 with array
    - `GET /applications/:id` — find by ObjectId (return 404 for malformed ID or not found), return 200
    - `PUT /applications/:id` — strip `appliedAt` from body, validate, update with `$set`, return 200 with updated document; 404 if not found
    - `DELETE /applications/:id` — delete by ObjectId, return 204; 404 if not found
  - All handlers catch DB errors and return 503 with `{ "error": "Database unavailable. Please try again later." }`
  - **Requirement**: 1.1, 1.2, 1.3, 1.6, 2.6, 5.1, 5.2, 5.5, 6.1, 6.2, 7.1, 7.3, 7.4, 8.1

- [x] 6. API — Express app entry point and middleware
  - Create `api/src/app.js` wiring together: `express.json()`, `morgan` logger, the applications router at `/applications`, a 404 catch-all returning `{ "error": "Not Found" }`, and a global error handler returning `{ "error": "Internal server error" }` while logging the full stack to `stderr`
  - Create `api/src/server.js` as the entry point: loads config, connects to DB, then starts listening on `API_PORT`
  - **Requirement**: 7.3, 7.4, 9.1

- [x] 7. API — property-based and integration tests
  - Write `api/tests/property/applications.property.test.js` using `fast-check` with minimum 100 iterations per property, each tagged with `// Feature: job-application-tracker, Property N:`:
    - P1: Incomplete submissions return 400 naming every missing required field
    - P2: Invalid `workArrangement` strings return 400 identifying the field
    - P3: Invalid `status` values return 400
    - P4: PUT requests including `appliedAt` do not change the stored timestamp
    - P5: POST then GET/:id round trip preserves all fields, sets status to "Applied", and sets non-null `appliedAt`
    - P6: `payscale` ≤ 500 chars accepted, > 500 chars rejected with 400
    - P7: GET /applications always returns records in descending `appliedAt` order
    - P8: PUT with a subset of fields leaves unmentioned fields unchanged
    - P9: After DELETE, GET/:id returns 404 and record is absent from GET /applications
  - Write `api/tests/integration/api.integration.test.js` using `testcontainers-node` for end-to-end CRUD flow and 503 scenario
  - **Requirement**: All design correctness properties P1–P9

- [x] 8. UI — shared layout, navigation, and CSS
  - Create `ui/` directory with `index.html`, `status.html`, `notes.html` each including the shared `<nav>` bar linking to all three views with active-page highlighting
  - Create `ui/css/styles.css` with base layout, responsive container, nav bar styles, status badge classes (`status-applied`, `status-phone-screen`, `status-interview`, `status-offer`, `status-moving-forward`, `status-passed-on`, `status-withdrawn`) each with a distinct background color, modal/dialog styles, and toast/notification styles
  - **Requirement**: 3.5, 6.3

- [x] 9. UI — applications list view (`index.html`)
  - Create `ui/js/api.js` exporting a shared `apiFetch(path, options)` wrapper that calls `fetch('/api' + path, options)`, checks `response.ok`, parses JSON, and throws a structured error on failure
  - Create `ui/js/index.js`:
    - On `DOMContentLoaded` call `GET /api/applications`; on failure render error banner and stop; on success render table rows sorted by `appliedAt` descending formatted as `YYYY-MM-DD HH:MM`; on empty array render "No applications recorded yet."
    - Each row displays: company, job title, location, work arrangement, status badge `<span>`, timestamp, Edit button, Delete button
    - "Add Application" button opens a form modal with fields: company (text), jobTitle (text), jobDescription (textarea), jobLocation (text), workArrangement (select: Remote / Hybrid / On-site), payscale (text, optional), notes (textarea, optional)
    - Form submit POSTs to `/api/applications`; on 201 close form and refresh list; on 400 display field-level error messages
    - Edit button populates the same form with existing values and submits `PUT /api/applications/:id`
    - Delete button opens a native `<dialog>` confirmation; "Confirm Delete" submits `DELETE /api/applications/:id` and refreshes list; "Cancel" dismisses dialog without API call
  - **Requirement**: 1.1, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 5.3, 5.4, 6.3, 6.4

- [x] 10. UI — status/progress view (`status.html`)
  - Create `ui/js/status.js`:
    - On `DOMContentLoaded` call `GET /api/applications` and group results into the seven status buckets
    - Render one section per status value (Applied, Phone Screen, Interview, Offer, Moving Forward, Passed On, Withdrawn), each with a heading showing status name and count (including zero)
    - Each application card shows: company name, job title, location, work arrangement, status badge, and an inline `<select>` pre-set to the current status
    - On `<select>` change issue `PUT /api/applications/:id` with `{ status: newValue }`; on success move/update the card in the DOM without full reload; on failure show inline error toast and revert `<select>` to previous value
  - **Requirement**: 3.1, 3.2, 3.3, 3.5, 3.6

- [x] 11. UI — notes view (`notes.html`)
  - Create `ui/js/notes.js`:
    - On `DOMContentLoaded` call `GET /api/applications` and render one notes card per application showing company name, job title, and an editable `<textarea>` pre-populated with the current notes value
    - Each card has a "Save" button that issues `PUT /api/applications/:id` with `{ notes: textareaValue }`
    - On success display "Saved ✓" confirmation near the button (auto-hide after a few seconds); on failure display an error message near the button and leave textarea content unchanged
  - **Requirement**: 4.1, 4.2, 4.3, 4.4, 4.5

- [x] 12. UI — Nginx configuration
  - Create `ui/nginx.conf` configuring: server listening on port 80, `root /usr/share/nginx/html`, `index index.html`, and a `location /api/` block that `proxy_pass`es to `http://api:${API_PORT}/` (stripping the `/api` prefix) with appropriate proxy headers
  - **Requirement**: 10.2, 10.3

- [x] 13. API Dockerfile
  - Create `api/Dockerfile` using `node:lts-alpine` as base, set `WORKDIR /app`, copy `package*.json`, run `npm ci --omit=dev`, copy source, set `CMD ["node", "src/server.js"]`
  - **Requirement**: 10.6

- [x] 14. UI Dockerfile
  - Create `ui/Dockerfile` using `nginx:alpine` as base, copy `ui/nginx.conf` to `/etc/nginx/conf.d/default.conf`, copy all static assets (`*.html`, `css/`, `js/`) to `/usr/share/nginx/html`
  - **Requirement**: 10.6

- [x] 15. Docker Compose orchestration
  - Create root-level `docker-compose.yml` with three services:
    - `db`: image `mongo:7`, named volume `mongo_data:/data/db`, healthcheck using `mongosh --eval "db.runCommand({ping:1})"` with start_period, interval, and retries configured
    - `api`: build `./api`, `env_file: .env`, `depends_on: db: condition: service_healthy`, exposes `API_PORT`
    - `ui`: build `./ui`, `env_file: .env`, ports `${UI_PORT}:80`, `depends_on: api`
  - Define `volumes: mongo_data:` at the top-level volumes key so it persists independently of containers
  - Smoke-test by running `docker compose up` and confirming the UI is accessible at `http://localhost:${UI_PORT}` within 60 seconds
  - **Requirement**: 10.1, 10.2, 10.3, 10.4, 10.5

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": [1] },
    { "wave": 2, "tasks": [2] },
    { "wave": 3, "tasks": [3] },
    { "wave": 4, "tasks": [4] },
    { "wave": 5, "tasks": [5] },
    { "wave": 6, "tasks": [6, 8] },
    { "wave": 7, "tasks": [7, 9, 10, 11] },
    { "wave": 8, "tasks": [12, 13] },
    { "wave": 9, "tasks": [14] },
    { "wave": 10, "tasks": [15] }
  ]
}
```

## Notes

- Tasks 2–7 are entirely within the `api/` directory and can be developed and tested independently of the UI.
- Tasks 8–12 are entirely within the `ui/` directory. The shared `api.js` fetch wrapper (Task 9) should be created first as Tasks 10 and 11 depend on it.
- Task 15 (Docker Compose) is the integration point and should be the last task completed. All individual components should be verified working before wiring them together.
- The `.env` file created in Task 1 is intentionally excluded from version control. The `.env.example` file is the committed reference.
- Property-based tests in Task 7 require a running MongoDB instance; the `testcontainers-node` integration in the integration test file handles this automatically.
