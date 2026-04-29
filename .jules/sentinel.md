## 2025-02-18 - [Information Disclosure in API Errors]
**Vulnerability:** API routes leak internal error details to clients via `error.message` or `String(error)`.
**Learning:** Returning detailed errors to the client exposes system internals, potentially aiding an attacker. This is particularly prevalent in catch blocks of route handlers.
**Prevention:** Fail securely by returning generic error messages (e.g., 'Operation failed') to the client, while logging the detailed error server-side.
