# Requirements Document

## Introduction

The Job Application Tracker is a web application that allows users to record, manage, and monitor their job applications throughout the hiring process. It provides a centralized dashboard to track application details such as company, role, location, compensation, work arrangement, and status. All data is persisted in a MongoDB database, served via a REST API backend, and presented through a browser-based frontend. The entire stack runs in Docker containers for portability.

## Glossary

- **Application**: A single job application record submitted by the user.
- **Application_Status**: The current stage of an application in the hiring pipeline (e.g., Applied, Phone Screen, Interview, Offer, Moving Forward, Passed On, Withdrawn).
- **Work_Arrangement**: The remote working model for a job position (Remote, Hybrid, On-site).
- **Payscale**: The compensation range or salary information associated with a job posting, which may be absent.
- **API**: The REST API backend service that handles all CRUD operations for applications.
- **Database**: The MongoDB instance used to persist application records.
- **UI**: The browser-based frontend web application.
- **Tracker**: The overall Job Application Tracker system comprising the UI, API, and Database.

---

## Requirements

### Requirement 1: Record a New Job Application

**User Story:** As a job seeker, I want to record a new job application with all relevant details, so that I can keep a complete log of every position I have applied for.

#### Acceptance Criteria

1. WHEN a user submits a new application form, THE API SHALL create an Application record containing: company name (required), job title (required), job description (required), job location (required), work arrangement (required), payscale (optional), and notes (optional).
2. WHEN a new Application record is successfully created and persisted to the Database, THE API SHALL automatically assign a UTC timestamp representing the date and time the application was saved.
3. WHEN a new Application record is created, THE API SHALL set the initial Application_Status to "Applied".
4. IF a user submits a new application form with any required field (company name, job title, job description, job location, or work arrangement) missing or empty, THEN THE API SHALL return a 400 Bad Request response whose body names each missing or invalid field.
5. WHEN a user selects work arrangement, THE UI SHALL present exactly three options: Remote, Hybrid, and On-site.
6. WHEN a new Application record is successfully created, THE API SHALL return a 201 Created response containing the full Application record including the assigned ID and timestamp.
7. IF a user submits a new application form with a work_arrangement value that is not one of Remote, Hybrid, or On-site, THEN THE API SHALL return a 400 Bad Request response whose body identifies the work_arrangement field as invalid.

---

### Requirement 2: View All Job Applications

**User Story:** As a job seeker, I want to see a list of all job applications I have submitted, so that I can quickly review every opportunity I am pursuing.

#### Acceptance Criteria

1. WHEN a user navigates to the applications list page, THE UI SHALL retrieve all Application records from the API and display them.
2. WHEN the API returns Application records, THE UI SHALL display them sorted by application timestamp in descending order (most recent first), formatted as YYYY-MM-DD HH:MM.
3. IF the API request fails when loading the applications list page, THEN THE UI SHALL display an error message and SHALL NOT render a partial or stale list.
4. THE UI SHALL display at minimum the following fields for each Application in the list: company name, job title, job location, work arrangement, Application_Status, and application timestamp.
5. WHEN no Application records exist, THE UI SHALL display a message indicating that no applications have been recorded yet.
6. THE API SHALL provide a GET /applications endpoint that returns all Application records from the Database sorted by application timestamp in descending order.

---

### Requirement 3: View Application Status and Progress

**User Story:** As a job seeker, I want a dedicated view showing the status of all my applications, so that I can quickly assess where each opportunity stands in the hiring pipeline.

#### Acceptance Criteria

1. WHEN a user navigates to the status/progress view, THE UI SHALL display all Application records grouped by each of the seven Application_Status values (Applied, Phone Screen, Interview, Offer, Moving Forward, Passed On, Withdrawn), including groups with zero records.
2. THE UI SHALL display the following Application_Status values as selectable options when updating an application: Applied, Phone Screen, Interview, Offer, Moving Forward, Passed On, Withdrawn.
3. WHEN a user updates the Application_Status of an Application, THE API SHALL persist the new status and return the updated Application record, and THE UI SHALL reflect the updated status in the view without requiring a full page reload.
4. WHEN an Application_Status update is submitted with a value not in the defined enum (Applied, Phone Screen, Interview, Offer, Moving Forward, Passed On, Withdrawn), THEN THE API SHALL return a 400 Bad Request response with a descriptive error message.
5. THE UI SHALL apply a distinct, consistent visual indicator (e.g., a specific color or badge style) to each of the seven Application_Status values so that every Application record with the same status displays the same indicator.
6. IF a status update API request fails, THEN THE UI SHALL display an error notification and SHALL NOT change the displayed Application_Status.

---

### Requirement 4: View and Manage Application Notes

**User Story:** As a job seeker, I want a dedicated notes view for each application, so that I can record and review free-form observations, follow-up reminders, and interview notes.

#### Acceptance Criteria

1. WHEN a user navigates to the notes view, THE UI SHALL display the notes field for each Application record.
2. WHEN a user submits updated notes for an Application, THE API SHALL persist the updated notes and return the updated Application record with a 200 OK response.
3. THE UI SHALL allow a user to edit the notes for any Application directly from the notes view.
4. WHEN notes are successfully saved, THE UI SHALL display a visible confirmation message indicating the save was successful.
5. IF the API request to save notes fails, THEN THE UI SHALL display an error message and SHALL NOT clear the user's unsaved input.

---

### Requirement 5: Update an Existing Application

**User Story:** As a job seeker, I want to update the details of an existing application, so that I can correct information or add new details as the hiring process progresses.

#### Acceptance Criteria

1. WHEN a user submits updated fields for an Application, THE API SHALL update only the provided fields on the existing Application record and return the full updated record with a 200 OK response.
2. WHEN an update request references an Application ID that does not exist in the Database, THEN THE API SHALL return a 404 Not Found response.
3. WHEN a user navigates to the edit interface for an Application that exists in the Database, THE UI SHALL display the edit form pre-populated with the current field values.
4. IF a user navigates to the edit interface for an Application ID that does not exist in the Database, THEN THE UI SHALL display an inline error message on the page stating the application was not found.
5. WHEN updating an Application, THE API SHALL ignore any timestamp field included in the request body and SHALL NOT modify the original application timestamp.
6. IF a user submits an update that sets a required field (company name, job title, job description, job location, or work arrangement) to an empty or missing value, THEN THE API SHALL return a 400 Bad Request response whose body names each invalid field.

---

### Requirement 6: Delete a Job Application

**User Story:** As a job seeker, I want to delete an application record, so that I can remove entries that were created in error or are no longer relevant.

#### Acceptance Criteria

1. WHEN a user confirms deletion of an Application, THE API SHALL permanently remove the Application record from the Database and return a 204 No Content response.
2. WHEN a delete request references an Application ID that does not exist, THEN THE API SHALL return a 404 Not Found response.
3. WHEN a user initiates a delete action, THE UI SHALL display a confirmation dialog that requires an explicit confirm action before submitting the delete request to the API.
4. WHEN a user cancels the confirmation dialog, THE UI SHALL dismiss the dialog and SHALL NOT submit a delete request to the API.

---

### Requirement 7: REST API Design and Data Validation

**User Story:** As a developer, I want the REST API to follow standard conventions and enforce data integrity, so that clients receive predictable, reliable responses.

#### Acceptance Criteria

1. THE API SHALL expose the following endpoints: POST /applications, GET /applications, GET /applications/:id, PUT /applications/:id, DELETE /applications/:id.
2. WHEN a request body contains a payscale field, THE API SHALL accept it as a free-text string of up to 500 characters to accommodate various compensation formats (e.g., "$120,000–$140,000/yr", "€80k").
3. THE API SHALL return all responses in JSON format with a Content-Type: application/json header.
4. IF the Database is unreachable when the API receives a request, THEN THE API SHALL return a 503 Service Unavailable response with a JSON error message.
5. WHEN a request includes a work_arrangement field with a value that is not Remote, Hybrid, or On-site, THEN THE API SHALL return a 400 Bad Request response identifying the work_arrangement field as invalid.

---

### Requirement 8: Database Persistence

**User Story:** As a developer, I want application data stored in MongoDB, so that records persist across application restarts.

#### Acceptance Criteria

1. THE Database SHALL store all Application records as documents in a single, dedicated MongoDB collection named "applications".
2. THE API SHALL read MongoDB connection information (host, port, database name) from an external configuration file or environment variables, not from hardcoded values.
3. WHEN the Tracker starts, THE API SHALL attempt to establish a connection to the Database using the configured connection parameters and SHALL complete the connection within 30 seconds.
4. IF the Database connection cannot be established at startup, THEN THE API SHALL log an error message to stderr that includes the configured host, port, and database name, and SHALL exit with a non-zero status code without accepting any requests.

---

### Requirement 9: Configuration Management

**User Story:** As an operator, I want all runtime configuration (database connection, UI port) in a properties or config file, so that I can adjust settings without modifying source code.

#### Acceptance Criteria

1. THE Tracker SHALL read the API server port, MongoDB connection URI, and MongoDB database name from a configuration file or environment variables; IF both are present, environment variable values SHALL take precedence over config file values.
2. WHEN a configuration value is missing or has an invalid type for its expected format (e.g., a non-integer API port, an empty MongoDB URI string), THEN THE API SHALL write a message to stderr that identifies the invalid or missing key by name and SHALL exit with a non-zero status code.
3. THE API server port configuration value SHALL be an integer in the range 1–65535; IF the configured port value is outside this range, THE API SHALL treat it as a misconfiguration and apply criterion 2.
4. THE Tracker SHALL provide a sample configuration file (e.g., `.env.example`) that lists every required configuration key with a representative example value illustrating the expected format.

---

### Requirement 10: Docker Container Deployment

**User Story:** As an operator, I want every component of the Tracker to run in Docker containers, so that I can run the entire application from my laptop without installing dependencies directly.

#### Acceptance Criteria

1. THE Tracker SHALL provide a `docker-compose.yml` file that defines services for the UI, API, and Database.
2. WHEN a user runs `docker compose up` from the project root, THE Tracker SHALL start all three services (UI, API, Database) and make the UI accessible in a browser at the configured port within 60 seconds.
3. THE Tracker SHALL expose the UI on a port that is read from the configuration file or an environment variable; the default value SHALL be documented in the sample configuration file.
4. THE API service container SHALL declare a dependency on the Database service container and SHALL use a health-check-based wait condition to defer accepting requests until the Database is ready.
5. THE Database service SHALL use a named Docker volume to persist MongoDB data across container restarts; removing and recreating the API or UI containers SHALL NOT delete the volume.
6. THE Tracker SHALL provide a `Dockerfile` for the API service and a separate `Dockerfile` for the UI service, each building a self-contained image with all required runtime dependencies.
