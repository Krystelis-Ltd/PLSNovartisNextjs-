## 2026-04-17 - Information Disclosure via Error Messages
**Vulnerability:** API routes were returning detailed error messages (including error stack/messages from try-catch blocks) to the client via NextResponse.json using the `details: msg` property.
**Learning:** The application had a pattern of exposing the full detailed error string on 500 status codes in multiple API endpoints (e.g. /api/upload, /api/extract). This violates the principle of failing securely.
**Prevention:** Always return generic error messages to the client (e.g. `{ error: "Operation failed" }`) and log the detailed error messages server-side only, such as in the `auditLog` or `console.error`.
