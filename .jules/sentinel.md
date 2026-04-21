## 2024-04-21 - [Prevent Information Disclosure in API Error Responses]
**Vulnerability:** API endpoints were returning internal error messages directly to the client in the `details` field of the JSON response upon failure.
**Learning:** Exposing raw error messages or stack traces can leak sensitive system architecture, AI provider error details, or internal logic.
**Prevention:** Always log the detailed error server-side (via audit logs or console) and return a generic error message (e.g., `{ error: "Operation failed" }`) to the client.
