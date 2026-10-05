# MEMORY — Gini

Persistent project record. Update this file whenever material product, architecture, implementation, security, deployment, or operational decisions change.

---

## Security & Data Protection — Standing Release Gate

**Status:** Mandatory for every current and future milestone. Security is not assumed just because the project uses Vercel, Supabase, GitHub, ChatGPT, or another managed platform.

### Baseline controls

1. **Accounts and privileged access**
   - Use 2FA/passkeys on GitHub, Vercel, Supabase, domain registrar, email, and other production accounts where supported.
   - Follow least privilege. Do not share owner/admin credentials.
   - Admin features require real authorization checks; a hidden URL is not security.

2. **Secrets and API keys**
   - Keep secrets only in server-side environment variables or approved secret stores.
   - Never commit secrets to Git, logs, screenshots, fixtures, client bundles, or documentation.
   - Do not expose privileged keys through `NEXT_PUBLIC_*` or browser code.
   - Rotate any credential that may have leaked.

3. **Database and tenant isolation**
   - Default-deny access.
   - Enable and test Row Level Security where supported.
   - Enforce organization/user ownership server-side.
   - Prove User/Org A cannot read or modify User/Org B data.

4. **API security**
   - Authenticate every protected endpoint.
   - Perform authorization on the server for every sensitive action.
   - Validate and normalize input.
   - Add rate limits, sensible request-size limits, and abuse controls.
   - Never trust object IDs, role claims, prices, permissions, or ownership supplied only by the browser.

5. **Web application protections**
   - HTTPS only in production.
   - Secure/HttpOnly/SameSite cookies where applicable.
   - Restrictive CORS.
   - CSRF protection where the authentication pattern requires it.
   - XSS-safe rendering and output encoding.
   - Content Security Policy and other appropriate security headers.

6. **Uploads and files**
   - Restrict file type, extension, MIME type, and size.
   - Use non-guessable storage paths/names where appropriate.
   - Keep sensitive files private by default and use short-lived authorized access.
   - Never execute user-uploaded content.

7. **Dependencies and supply chain**
   - Pin/lock dependencies.
   - Review new packages before use.
   - Enable dependency and secret scanning where available.
   - Do not adopt arbitrary GitHub code solely because it is free.

8. **AI-specific security**
   - Treat prompts, retrieved webpages, documents, emails, transcripts, tool output, and user uploads as untrusted data.
   - Prompt injection must never grant permissions, expose secrets, override authorization, or trigger sensitive actions automatically.
   - Sensitive actions require explicit policy/authorization checks outside the model.

9. **Logging and privacy**
   - Do not log passwords, session tokens, API keys, raw auth headers, or unnecessary sensitive customer/employee/company data.
   - Minimize collected data and define retention/deletion rules for sensitive information.
   - Treat sensitive customer, employee, HR, interview, company, and proprietary data as sensitive from Day 1.

10. **Backups, recovery, and incidents**
    - Maintain a tested backup/export and restore path for critical data.
    - Keep an incident-response/revocation process for compromised credentials or accounts.
    - Preserve useful audit logs without leaking secrets.

11. **Phishing/domain/email protection**
    - Protect the domain registrar and DNS account with strong authentication.
    - Use the canonical product domain consistently for sign-in and sensitive actions.
    - Configure SPF, DKIM, and DMARC before relying on production email.
    - Avoid login or payment flows through confusing/untrusted domains.

12. **Security verification before production**
    - Deliberately test unauthorized reads/writes, ID tampering, expired sessions, privilege escalation, cross-tenant access, oversized/malicious input, unsafe HTML, upload abuse, and rate-limit behavior.
    - Run lint/typecheck/tests plus security-relevant automated tests before release.
    - Record discovered failures and fixes in this MEMORY.md.

### Production security gate

A project must **not** be called production-ready until, at minimum:

- authentication works where required;
- authorization and least privilege are enforced server-side;
- tenant/user isolation is proven;
- database policies/RLS are verified where applicable;
- secrets are not exposed;
- protected APIs reject unauthorized access;
- rate limiting/abuse controls are present where applicable;
- uploads are restricted where applicable;
- security headers and HTTPS are in place;
- dependency/secret scans are clean or reviewed;
- AI prompt-injection boundaries are tested where AI is used;
- sensitive logging is reviewed;
- backups/recovery are defined for persistent production data;
- audit logging exists for important privileged actions;
- a deliberate manual security/abuse test has been performed.

**Important:** Passing this gate does not mean “unhackable.” It means reasonable preventive controls, blast-radius limits, detection, and recovery are in place and verified.

---
