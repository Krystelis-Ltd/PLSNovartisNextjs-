## 2024-04-12 - [Information Disclosure in API Errors]
**Vulnerability:** API endpoints returning detailed stack trace or error message strings to the frontend during 500 error responses (e.g. `NextResponse.json({ error: "Failed", details: msg })`).
**Learning:** This repo's Next.js API route templates commonly pass error string data directly to the client response inside a `details` property on failure.
**Prevention:** Always verify that error responses only send generic error messages to the client (e.g., `{ error: "Operation failed" }`) and restrict detailed error message logging strictly to server-side processes via `auditLog` or `console.error`.
