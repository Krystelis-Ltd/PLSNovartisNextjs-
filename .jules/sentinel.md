## 2024-04-28 - Secure IP Extraction
**Vulnerability:** The application was extracting client IP addresses insecurely from the x-forwarded-for header, taking the entire value or relying on x-real-ip, which is prone to spoofing.
**Learning:** In Azure App Service environments, IP addresses must be securely extracted by prioritizing the X-Azure-ClientIP header (verified) or the **last** entry of the comma-separated X-Forwarded-For list (appended by the proxy).
**Prevention:** Always use a dedicated secure IP extraction function that accounts for the specific hosting environment's headers and proxy behavior.
