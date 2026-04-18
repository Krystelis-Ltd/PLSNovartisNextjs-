## 2024-05-18 - Prevent Error Details Leakage
**Vulnerability:** API routes returned detailed exception strings (`error.message`) in HTTP 500 response bodies.
**Learning:** Returning raw server exception details (e.g., `details: msg`) in API error responses is a common pattern that risks leaking sensitive internal application details, file paths, or third-party service errors to end users.
**Prevention:** Ensure that global exception handlers or individual catch blocks in API endpoints respond to the client with generic error messages (e.g., `{ error: "Operation failed" }`) while logging the verbose internal errors only server-side.
