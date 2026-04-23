## 2025-02-23 - [Information Disclosure in API Error Handling]
**Vulnerability:** API routes were leaking internal server details by passing the full error messages (e.g., `error.message` or stack traces) directly back to the client via `NextResponse.json({ error: "Operation failed", details: msg })`. This exposed internal logic, file validation logic, and potentially sensitive stack traces.
**Learning:** Returning `msg` or `error.message` in 400 and 500 API responses discloses internal details to users, violating the fail securely principle.
**Prevention:** Always fail securely by returning generic error messages to the client (e.g., `{ error: "Extraction failed" }`) and only log the full error details on the server side (e.g., using `auditLog` and `console.error`).
