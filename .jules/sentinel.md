## 2024-04-15 - Prevent Information Disclosure in API Error Responses
**Vulnerability:** Next.js API routes were leaking internal error messages and potential stack traces (`error.message` or `String(error)`) to the client via `NextResponse.json({ details: msg })` in 500 status responses.
**Learning:** Returning raw error objects or exception messages to the client can expose sensitive backend configuration, logic details, or paths. This violates the "fail securely" principle where errors should not expose sensitive data.
**Prevention:** Always log the detailed error internally (e.g., via `auditLog` or `console.error`), but return a generic, static error string to the client like `{ error: "Operation failed" }` without appending internal exception messages.
