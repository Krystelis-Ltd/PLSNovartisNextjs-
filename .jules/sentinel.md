## 2025-04-09 - [Fix Information Disclosure in API Errors]
**Vulnerability:** Several API routes (`extract`, `chat`, `refine`, `generate`, `upload`, `convert-to-markdown`) were leaking internal error messages and potentially stack traces to the client by including `details: error.message` in their JSON responses upon a 500 status code.
**Learning:** Returning unhandled exception details directly in HTTP responses is a security risk as it can expose sensitive internal state, infrastructure paths, or logic flaws to end users.
**Prevention:** Catch blocks should log the detailed error server-side (e.g., `console.error` and `auditLog`) and only return a generic, sanitized error message like `{ error: "Operation failed" }` to the client.
