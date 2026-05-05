/* ── AI Provider Abstraction ────────────────────────────────────────────────── */
/* Supports: demo | anthropic | openai (any compatible) | bedrock              */

export type AIProvider = 'demo' | 'anthropic' | 'openai' | 'bedrock';

export interface AIConfig {
  provider: AIProvider;
  apiKey?: string;
  baseUrl?: string;   // for openai-compatible APIs
  model?: string;
  region?: string;    // bedrock
  accessKeyId?: string;    // bedrock
  secretAccessKey?: string; // bedrock
}

export interface FindingGenerationContext {
  title: string;
  description?: string;
  reproduction?: string;
  projectName?: string;
  assets?: string;
}

export interface GeneratedFinding {
  summary: string;
  description: string;
  reproduction: string;
  impact: string;
  remediation: string;
  references: string;
  cwe: string;
  owasp: string;
  severity: string;
  cvss: { AV: string; AC: string; PR: string; UI: string; S: string; C: string; I: string; A: string };
  assets: string[];
}

export interface ExecutiveSummaryContext {
  projectName: string;
  engagement: string;
  findings: Array<{
    title: string;
    severity: string;
    description?: string;
    impact?: string;
    remediation?: string;
    cwe?: string;
    cvss?: number;
  }>;
  counts: Record<string, number>;
  riskScore: number;
  startDate?: string;
  endDate?: string;
}

export interface GeneratedSummary {
  executiveSummary: string;
  methodology: string;
  attackNarrative: string;
}

// ── Demo Data ─────────────────────────────────────────────────────────────────

const DEMO_FINDING: GeneratedFinding = {
  summary: 'An Insecure Direct Object Reference (IDOR) vulnerability was identified in the user account management endpoint, allowing authenticated attackers to modify other users\' account credentials by manipulating user identifiers in API requests.',
  description: `## Overview

An **Insecure Direct Object Reference (IDOR)** vulnerability exists in the \`/user/edit\` API endpoint. The application fails to properly verify that the authenticated user has authorization to modify the target account, relying solely on the user-supplied \`userId\` parameter in the POST request body.

## Technical Details

The endpoint accepts a POST request with a JSON body containing user account details. The \`userId\` field is used directly to identify which account to update without verifying ownership or applying server-side access controls.

\`\`\`http
POST /user/edit HTTP/1.1
Host: api.target.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
  "userId": "VICTIM_USER_ID",
  "password": "attacker_controlled_password",
  "email": "attacker@evil.com"
}
\`\`\`

The server processes the request using the attacker-supplied \`userId\` without validating session ownership, resulting in unauthorized modification of victim account credentials.`,
  reproduction: `### Prerequisites
- Two valid user accounts (attacker and victim)
- Network interception proxy (Burp Suite / OWASP ZAP)
- Valid session token for the attacker account

### Step-by-Step

1. **Authenticate** as the attacker user and capture a valid session token
2. **Intercept** a normal \`/user/edit\` request using Burp Suite
3. **Modify** the \`userId\` parameter in the POST body to the victim's user ID:

\`\`\`json
{
  "userId": "TARGET_VICTIM_ID",
  "password": "Attacker@12345",
  "email": "attacker@evil.com"
}
\`\`\`

4. **Forward** the modified request — the server returns HTTP 200 OK
5. **Verify** by attempting to log in as the victim using the new password

### Proof of Concept

\`\`\`bash
curl -X POST https://api.target.com/user/edit \\
  -H "Authorization: Bearer <ATTACKER_TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{"userId":"<VICTIM_ID>","password":"pwned123","email":"attacker@test.com"}'
\`\`\`

**Expected Response:**
\`\`\`json
{"success": true, "message": "Profile updated successfully"}
\`\`\``,
  impact: `### Business Impact

This vulnerability allows any authenticated attacker to:

- **Full account takeover** of any user account in the system
- **Unauthorized access** to victim user data, private messages, and sensitive information
- **Credential manipulation** — attackers can change passwords and email addresses, locking legitimate users out of their accounts
- **Privilege escalation** — if an attacker targets administrator accounts, they can gain full administrative control of the application
- **Data exfiltration** — post-takeover, attackers can access all data associated with the compromised accounts
- **Regulatory exposure** — unauthorized access to personal data may constitute a breach under GDPR, HIPAA, or PCI-DSS

### Affected Scope

All registered user accounts are potentially affected. The vulnerability requires only a valid session token — no special privileges are needed. An attacker need only enumerate or guess valid user IDs to compromise any account.

**CVSS 3.1 Score: 8.8 (High)** — Network-accessible, low complexity, requires only low-privilege authentication, no user interaction, significant confidentiality and integrity impact.`,
  remediation: `### Immediate Actions

1. **Server-side authorization check** — Verify that the authenticated session's user ID matches the \`userId\` in the request before processing any modifications:

\`\`\`javascript
// Server-side fix (Node.js example)
app.post('/user/edit', authenticate, async (req, res) => {
  const { userId, ...updates } = req.body;

  // CRITICAL: Verify ownership
  if (req.session.userId !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Proceed with update
  await db.user.update({ where: { id: userId }, data: updates });
});
\`\`\`

2. **Remove user-controlled ID from request body** — Derive the user ID exclusively from the authenticated session token rather than accepting it as user input:

\`\`\`javascript
// Preferred: derive user ID from session only
app.post('/user/edit', authenticate, async (req, res) => {
  const userId = req.session.userId; // Trust only the session
  await db.user.update({ where: { id: userId }, data: req.body });
});
\`\`\`

### Long-term Recommendations

- Implement a centralized authorization middleware that enforces object-level access control across all endpoints
- Conduct a full audit of all API endpoints that accept user-supplied identifiers to identify similar IDOR patterns
- Adopt an **Attribute-Based Access Control (ABAC)** or **Role-Based Access Control (RBAC)** framework
- Add automated IDOR testing to your CI/CD pipeline using tools such as **Autorize** (Burp extension) or **IDOR Hunter**`,
  references: `- [OWASP — Broken Object Level Authorization (BOLA/IDOR)](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/)
- [OWASP Testing Guide — Testing for IDOR](https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References)
- [CWE-639: Authorization Bypass Through User-Controlled Key](https://cwe.mitre.org/data/definitions/639.html)
- [PortSwigger Web Academy — IDOR](https://portswigger.net/web-security/access-control/idor)
- [HackerOne Hacktivity — IDOR Disclosures](https://hackerone.com/hacktivity?querystring=IDOR)`,
  cwe: 'CWE-639',
  owasp: 'A01:2021',
  severity: 'high',
  cvss: { AV: 'N', AC: 'L', PR: 'L', UI: 'N', S: 'U', C: 'H', I: 'H', A: 'N' },
  assets: [],
};

function buildDemoFinding(ctx: FindingGenerationContext): GeneratedFinding {
  return {
    ...DEMO_FINDING,
    assets: ctx.assets ? ctx.assets.split('\n').map(a => a.trim()).filter(Boolean) : [],
  };
}

function buildDemoSummary(ctx: ExecutiveSummaryContext): GeneratedSummary {
  const critCount = ctx.counts.critical ?? 0;
  const highCount = ctx.counts.high ?? 0;
  const medCount = ctx.counts.medium ?? 0;
  const totalCount = ctx.findings.length;
  const riskLabel = ctx.riskScore >= 9 ? 'Critical' : ctx.riskScore >= 7 ? 'High' : ctx.riskScore >= 4 ? 'Medium' : ctx.riskScore > 0 ? 'Low' : 'Minimal';

  const topFindings = ctx.findings
    .filter(f => f.severity === 'critical' || f.severity === 'high')
    .slice(0, 3)
    .map(f => `- **${f.title}** (${f.severity.charAt(0).toUpperCase() + f.severity.slice(1)})${f.cwe ? ` — ${f.cwe}` : ''}`)
    .join('\n');

  return {
    executiveSummary: `## Executive Summary

${ctx.projectName} engaged our security team to conduct a comprehensive penetration assessment of its ${ctx.engagement} environment${ctx.startDate ? ` between ${ctx.startDate} and ${ctx.endDate}` : ''}. The objective was to identify, validate, and prioritize exploitable security vulnerabilities before malicious actors could exploit them.

### Risk Posture

The overall risk posture is assessed as **${riskLabel}** with a composite CVSS score of **${ctx.riskScore.toFixed(1)}**. The assessment identified **${totalCount} findings** across the in-scope environment:

| Severity | Count |
|----------|-------|
| Critical | ${critCount} |
| High | ${highCount} |
| Medium | ${medCount} |
| Low | ${ctx.counts.low ?? 0} |
| Informational | ${ctx.counts.info ?? 0} |

${critCount + highCount > 0 ? `### Key Risk Areas\n\nThe most significant findings requiring immediate remediation are:\n\n${topFindings}\n` : ''}
### Recommendation Summary

The assessment team recommends that all **Critical** and **High** severity findings be remediated within **7 and 14 days** respectively, following a risk-prioritized remediation plan. Medium severity findings should be addressed within 30 days as part of the next scheduled development cycle.

Management attention is drawn to the systemic nature of certain vulnerability classes identified during this assessment. A root-cause analysis approach — rather than point-fix remediation — is strongly recommended to prevent recurrence across the application portfolio.`,

    methodology: `## Methodology

This penetration test was conducted in accordance with industry-standard frameworks including the **Penetration Testing Execution Standard (PTES)**, **OWASP Testing Guide v4.2**, and **NIST SP 800-115**.

### Testing Phases

**1. Reconnaissance & Intelligence Gathering**
Passive and active information gathering to map the attack surface, enumerate endpoints, and identify technology stack components.

**2. Threat Modelling**
Analysis of the application architecture to identify high-value targets, trust boundaries, and potential attack chains.

**3. Vulnerability Identification**
Systematic testing combining automated scanning (Burp Suite Professional, OWASP ZAP) with manual testing techniques across all OWASP Top 10 categories and application-specific business logic.

**4. Exploitation & Validation**
Manual exploitation of identified vulnerabilities to confirm impact and eliminate false positives. All exploitation was conducted safely to avoid disruption to production systems.

**5. Post-Exploitation Analysis**
Assessment of lateral movement potential and business impact of successful exploitation chains.

**6. Reporting**
Documentation of all findings with detailed reproduction steps, risk ratings, and actionable remediation guidance prioritized by business impact.

### Tools & Techniques

\`\`\`
Burp Suite Professional   — Web proxy, scanner, intruder
OWASP ZAP                 — Automated scanning and fuzzing
sqlmap                    — SQL injection detection and exploitation
ffuf / dirb               — Directory and endpoint enumeration
Nmap / Masscan            — Port scanning and service enumeration
Nuclei                    — Template-based vulnerability scanning
Custom scripts            — Application-specific test cases
\`\`\``,

    attackNarrative: `## Attack Narrative

*The following narrative describes the simulated attack path taken during the assessment. All activities were performed within the agreed rules of engagement.*

### Initial Access

Testing commenced with unauthenticated reconnaissance of the application's external attack surface. Enumeration of API endpoints revealed a non-standard versioned API structure with inconsistent authentication enforcement across routes.

### Vulnerability Chaining

${critCount + highCount > 0 ? `During authenticated testing, the team identified several high-impact vulnerabilities that, when combined, represent a significant attack chain:

The most critical finding — ${ctx.findings.find(f => f.severity === 'critical' || f.severity === 'high')?.title || 'a high-severity access control bypass'} — allowed the test team to escalate privileges and access data beyond the intended authorization boundary. This was compounded by insufficient logging and monitoring, which would delay detection of a real attack.` : `Authenticated testing revealed a series of medium-severity vulnerabilities. While no single finding presents a critical path to full compromise, an adversary with sufficient time and persistence could chain these issues to achieve unauthorized data access.`}

### Impact Assessment

The successful exploitation of the identified attack chains demonstrated the potential for:

1. **Unauthorized data access** — Reading or modifying records belonging to other users
2. **Authentication bypass** — Circumventing identity controls to impersonate legitimate users
3. **Privilege escalation** — Gaining elevated access beyond the intended authorization level

### Defensive Gaps Observed

The assessment identified the following systemic defensive weaknesses that enabled the attack paths:

- Insufficient server-side authorization validation at the object level
- Absence of rate limiting on sensitive endpoints
- Inadequate input validation and output encoding in certain data flows
- Missing security headers that would mitigate client-side attack vectors`,
  };
}

// ── AI Prompt Construction ───────────────────────────────────────────────────

const FINDING_SYSTEM_PROMPT = `You are a senior penetration tester and security researcher with 30+ years of hands-on experience writing professional security assessment reports for Fortune 500 clients. Your reports are known for technical precision, clear remediation guidance, and business-context impact analysis.

Your task is to analyze a vulnerability description and produce a complete, professional finding entry for inclusion in a penetration testing report.

Return ONLY a valid JSON object with these exact fields:
{
  "summary": "1-2 sentence executive-level summary (no markdown)",
  "description": "Detailed markdown description: overview, technical details with code blocks if applicable",
  "reproduction": "Step-by-step reproduction in markdown with numbered steps and code blocks",
  "impact": "Business and technical impact analysis in markdown",
  "remediation": "Specific remediation guidance in markdown with code examples",
  "references": "Markdown list of authoritative references (OWASP, CWE, CVE, research papers)",
  "cwe": "Primary CWE ID (e.g. CWE-79)",
  "owasp": "OWASP Top 10 category (e.g. A03:2021)",
  "severity": "critical | high | medium | low | info",
  "cvss": {
    "AV": "N|A|L|P",
    "AC": "L|H",
    "PR": "N|L|H",
    "UI": "N|R",
    "S": "U|C",
    "C": "N|L|H",
    "I": "N|L|H",
    "A": "N|L|H"
  },
  "assets": ["array", "of", "affected", "assets"]
}

Use proper markdown formatting. Include realistic HTTP request/response examples where relevant. Be technically accurate — CWE and OWASP mappings must be correct. CVSS scores must accurately reflect the vulnerability's characteristics.`;

const SUMMARY_SYSTEM_PROMPT = `You are a senior penetration testing lead with 30+ years of experience writing executive-level security reports for C-suite audiences and technical teams alike.

You will be provided with structured finding data from a completed penetration test. Your task is to write three sections for the final report.

Return ONLY a valid JSON object with these exact fields:
{
  "executiveSummary": "Markdown — executive summary including risk posture table, key findings overview, and management recommendations",
  "methodology": "Markdown — testing methodology covering phases, standards used (PTES, OWASP), and tools",
  "attackNarrative": "Markdown — narrative description of the attack path, attack chains discovered, and defensive gaps"
}

Write in a professional, clear style suitable for both technical and non-technical audiences. Use markdown tables, bold key terms, and code blocks where appropriate.`;

function buildFindingUserMessage(ctx: FindingGenerationContext): string {
  return `Vulnerability Title: ${ctx.title}

${ctx.description ? `Description / Notes from Tester:\n${ctx.description}\n` : ''}
${ctx.reproduction ? `\nReproduction Steps (partial):\n${ctx.reproduction}\n` : ''}
${ctx.projectName ? `\nProject / Target: ${ctx.projectName}` : ''}
${ctx.assets ? `\nAffected Assets: ${ctx.assets}` : ''}

Please generate a complete, professional penetration testing finding entry based on the above information.`;
}

function buildSummaryUserMessage(ctx: ExecutiveSummaryContext): string {
  const findingsList = ctx.findings.map((f, i) =>
    `${i + 1}. [${f.severity.toUpperCase()}] ${f.title}${f.cwe ? ` (${f.cwe})` : ''}${f.cvss ? ` CVSS ${f.cvss}` : ''}
   Impact: ${f.impact?.slice(0, 200) || 'Not specified'}
   Remediation: ${f.remediation?.slice(0, 150) || 'Not specified'}`
  ).join('\n\n');

  return `Project: ${ctx.projectName}
Engagement Type: ${ctx.engagement}
${ctx.startDate ? `Period: ${ctx.startDate} — ${ctx.endDate}` : ''}
Risk Score: ${ctx.riskScore.toFixed(1)}/10
Total Findings: ${ctx.findings.length}
Finding Distribution: Critical: ${ctx.counts.critical ?? 0}, High: ${ctx.counts.high ?? 0}, Medium: ${ctx.counts.medium ?? 0}, Low: ${ctx.counts.low ?? 0}, Info: ${ctx.counts.info ?? 0}

FINDINGS:
${findingsList}

Please write the executive summary, methodology, and attack narrative for this penetration test report.`;
}

// ── AWS Signature V4 (minimal, for Bedrock) ──────────────────────────────────

async function hmacSHA256(key: ArrayBuffer | string, message: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const keyBuf = typeof key === 'string' ? enc.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey('raw', keyBuf, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
}

async function sha256Hex(data: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function signBedrockRequest(
  method: string,
  url: string,
  body: string,
  region: string,
  accessKeyId: string,
  secretAccessKey: string,
): Promise<Record<string, string>> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const dateStamp = amzDate.slice(0, 8);
  const service = 'bedrock';
  const host = new URL(url).hostname;
  const payloadHash = await sha256Hex(body);
  const signedHeaders = 'content-type;host;x-amz-date';

  const canonicalRequest = [
    method,
    new URL(url).pathname,
    '',
    `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credScope, await sha256Hex(canonicalRequest)].join('\n');

  const enc = new TextEncoder();
  const kDate    = await hmacSHA256(enc.encode('AWS4' + secretAccessKey).buffer as ArrayBuffer, dateStamp);
  const kRegion  = await hmacSHA256(kDate, region);
  const kService = await hmacSHA256(kRegion, service);
  const kSigning = await hmacSHA256(kService, 'aws4_request');
  const sig = bufToHex(await hmacSHA256(kSigning, stringToSign));

  return {
    'Content-Type': 'application/json',
    'X-Amz-Date': amzDate,
    'Authorization': `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${sig}`,
  };
}

// ── Core AI Call ─────────────────────────────────────────────────────────────

async function callAI(config: AIConfig, systemPrompt: string, userMessage: string): Promise<string> {
  const provider = config.provider;

  if (provider === 'demo') {
    // Demo: artificial delay for effect
    await new Promise(r => setTimeout(r, 1800));
    return '';  // Caller handles demo
  }

  if (provider === 'anthropic') {
    const model = config.model || 'claude-opus-4-5';
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${err}`);
    }
    const data = await res.json();
    return data.content?.[0]?.text ?? '';
  }

  if (provider === 'openai') {
    const baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const model = config.model || 'gpt-4o';
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey || ''}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI-compatible API error ${res.status}: ${err}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  }

  if (provider === 'bedrock') {
    const region = config.region || 'us-east-1';
    const model = config.model || 'anthropic.claude-opus-4-5-20251101-v1:0';
    const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(model)}/invoke`;
    const body = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
    const headers = await signBedrockRequest('POST', url, body, region, config.accessKeyId || '', config.secretAccessKey || '');
    const res = await fetch(url, { method: 'POST', headers, body });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Bedrock API error ${res.status}: ${err}`);
    }
    const data = await res.json();
    return data.content?.[0]?.text ?? '';
  }

  throw new Error(`Unknown AI provider: ${provider}`);
}

function extractJSON(raw: string): unknown {
  const cleaned = raw.trim().replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(cleaned); } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Could not parse JSON from AI response');
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function generateFinding(config: AIConfig, ctx: FindingGenerationContext): Promise<GeneratedFinding> {
  if (config.provider === 'demo') return buildDemoFinding(ctx);

  const raw = await callAI(config, FINDING_SYSTEM_PROMPT, buildFindingUserMessage(ctx));
  const parsed = extractJSON(raw) as Partial<GeneratedFinding>;

  return {
    summary:      parsed.summary      || '',
    description:  parsed.description  || '',
    reproduction: parsed.reproduction || '',
    impact:       parsed.impact       || '',
    remediation:  parsed.remediation  || '',
    references:   parsed.references   || '',
    cwe:          parsed.cwe          || '',
    owasp:        parsed.owasp        || '',
    severity:     parsed.severity     || 'medium',
    cvss:         parsed.cvss         || { AV:'N', AC:'L', PR:'N', UI:'N', S:'U', C:'N', I:'N', A:'N' },
    assets:       Array.isArray(parsed.assets) ? parsed.assets : [],
  };
}

export async function generateSummary(config: AIConfig, ctx: ExecutiveSummaryContext): Promise<GeneratedSummary> {
  if (config.provider === 'demo') return buildDemoSummary(ctx);

  const raw = await callAI(config, SUMMARY_SYSTEM_PROMPT, buildSummaryUserMessage(ctx));
  const parsed = extractJSON(raw) as Partial<GeneratedSummary>;

  return {
    executiveSummary: parsed.executiveSummary || '',
    methodology:      parsed.methodology      || '',
    attackNarrative:  parsed.attackNarrative  || '',
  };
}
