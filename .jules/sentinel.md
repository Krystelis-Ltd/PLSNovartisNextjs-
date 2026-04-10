## 2025-04-10 - [Fail Securely: Do Not Leak API Error Messages]
**Vulnerability:** Internal system errors and stack traces were exposed to the client in `500 Internal Server Error` responses across multiple API routes (e.g. `NextResponse.json({ error: "Operation failed", details: msg })`).
**Learning:** Returning `error.message` or `String(error)` in JSON responses can inadvertently leak sensitive system details, file paths, or third-party service internals to unauthenticated users or malicious actors.
**Prevention:** Always fail securely by returning generic error messages to the client (e.g., `{ error: "Operation failed" }`) and logging detailed error messages (`error.message` or `String(error)`) only server-side via `auditLog` or `console.error`.
