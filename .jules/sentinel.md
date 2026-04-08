## 2024-04-08 - Prevent Error Detail Leakage
**Vulnerability:** Internal error messages and stack traces (e.g. `error.message`) were being returned directly in 500 HTTP responses.
**Learning:** API routes must decouple client responses from server logs to prevent information disclosure.
**Prevention:** Always return generic error messages (e.g. `{ error: "Operation failed" }`) to the client while retaining detailed errors exclusively in server-side logs (`console.error` and `auditLog`).
