/* ── AI Provider Abstraction ────────────────────────────────────────────────── */
/* Supports: demo | anthropic | openai (any compatible) | bedrock              */

export type AIProvider = 'demo' | 'anthropic' | 'openai' | 'bedrock';

export interface AIConfig {
  provider: AIProvider;
  apiKey?: string;
  baseUrl?: string;      // for openai-compatible APIs
  model?: string;
  region?: string;       // bedrock
  accessKeyId?: string;  // bedrock (IAM)
  secretAccessKey?: string; // bedrock (IAM)
  bedrockApiKey?: string;   // bedrock (API key auth — alternative to IAM)
}

export interface FindingGenerationContext {
  title: string;
  description?: string;
  reproduction?: string;
  projectName?: string;
  assets?: string;
  notes?: string;           // project engagement notes — sent to AI for richer context
}

export interface GeneratedFinding {
  title: string;
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
  notes?: string;           // project engagement notes
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
  title: string;
  executiveSummary: string;
  methodology: string;
  attackNarrative: string;
}

// ── Demo Data ─────────────────────────────────────────────────────────────────

const DEMO_FINDING: GeneratedFinding = {
  title: 'Insecure Direct Object Reference (IDOR) in User Account Management',
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
    title: `Security Assessment Report: ${critCount + highCount > 0 ? 'Critical Issues Identified' : 'Moderate Risk Posture'}`,
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

const FINDING_SYSTEM_PROMPT = `You are an elite penetration tester and vulnerability researcher — OSCP, OSCE, OSEP, CREST CRT certified — with 15+ years of hands-on offensive security experience across financial services, healthcare, government, and critical infrastructure. You have authored hundreds of penetration testing reports for FTSE 100 and Fortune 500 clients and are known for findings that are technically precise, legally defensible, and immediately actionable.

Your task is to transform raw vulnerability notes from a tester into a complete, publication-quality finding entry for a professional penetration testing report.

QUALITY STANDARDS:
- Title: Clear, specific, professional (e.g. "Unauthenticated SQL Injection in User Search Endpoint" not "SQL Injection found")
- Summary: 1-2 crisp sentences for non-technical executives — convey what it is and why it matters, no jargon
- Description: Deep technical narrative using markdown — explain the root cause, how the flaw arises, reference relevant RFCs/specs where applicable. Include realistic HTTP request/response examples, code snippets, or command-line demonstrations using fenced code blocks
- Reproduction: Precise, numbered steps a junior tester can follow to independently verify the finding. Include prerequisites, exact payloads, expected vs actual behaviour, and tool-specific commands (Burp Suite, curl, sqlmap, etc.)
- Impact: Two-part analysis — (1) immediate technical impact (what can an attacker do right now?) and (2) business/regulatory impact (data breach, GDPR/PCI-DSS exposure, reputational damage, financial loss). Be specific with dollar figures or record counts where context allows
- Remediation: Tiered guidance — immediate mitigations (hours), short-term fixes (days), long-term architectural recommendations (weeks). Include concrete code examples showing the vulnerable pattern and the secure alternative
- References: Authoritative sources only — OWASP, CWE, CVE, NIST, vendor advisories, academic research
- CWE: Primary CWE with correct ID — be specific (e.g. CWE-89 for SQL injection, not CWE-20)
- OWASP: Most specific Top 10 2021 mapping
- Severity & CVSS: Must accurately reflect exploitability and impact. Consider authentication, network access, user interaction requirements precisely

Return ONLY a valid JSON object — no preamble, no explanation, no markdown fences around the JSON:
{
  "title": "Specific, professional title (6-12 words)",
  "summary": "1-2 sentence executive summary — what is it, why does it matter (no markdown)",
  "description": "Detailed markdown: root cause, technical mechanics, HTTP/code examples in fenced blocks",
  "reproduction": "Markdown numbered steps with exact payloads, commands, expected output",
  "impact": "Markdown: technical impact paragraph + business/regulatory impact paragraph",
  "remediation": "Markdown: immediate fix + code example showing vulnerable vs secure pattern + architectural recommendation",
  "references": "Markdown bullet list: OWASP link, CWE link, relevant CVEs or advisories",
  "cwe": "CWE-NNN",
  "owasp": "ANN:2021 — Category Name",
  "severity": "critical | high | medium | low | info",
  "cvss": { "AV": "N|A|L|P", "AC": "L|H", "PR": "N|L|H", "UI": "N|R", "S": "U|C", "C": "N|L|H", "I": "N|L|H", "A": "N|L|H" },
  "assets": ["list", "of", "affected", "endpoints", "or", "components"]
}`;

const SUMMARY_SYSTEM_PROMPT = `You are a principal penetration testing consultant and technical report author with 15+ years of experience delivering security assessments to executive boards, audit committees, and technical teams at global enterprises. You hold CREST CCT, OSCP, CISSP, and have written hundreds of reports that have driven multi-million dollar security remediation programmes.

You will receive structured finding data from a completed penetration test. Your job is to produce four report sections that will be read by the CISO, board members, and technical leads. The writing must be simultaneously accessible to non-technical executives AND rigorous enough to satisfy a technical auditor.

QUALITY STANDARDS:

TITLE: Specific and impactful — reflect the engagement type, client context, and overall risk posture (e.g. "External Penetration Test Report: Critical Authentication Bypass Identified — Q1 2026")

EXECUTIVE SUMMARY: This is what the CEO reads. Structure as:
1. Opening paragraph: one-sentence bottom line (what was tested, what was found, what it means for the business)
2. Risk posture table (markdown) showing finding counts by severity
3. Top 3-5 critical/high findings with one-line business impact each
4. Overall risk rating with brief justification
5. Management recommendations — 3-5 strategic actions prioritised by risk reduction
Use plain language. Avoid jargon. Quantify risk where possible (data records at risk, regulatory exposure, potential financial impact).

METHODOLOGY: Professional testing methodology section covering:
- Engagement type (black-box/grey-box/white-box) and scope
- Testing phases (reconnaissance, enumeration, exploitation, post-exploitation, reporting)
- Standards and frameworks referenced (PTES, OWASP Testing Guide, NIST SP 800-115, CHECK, CREST)
- Tools and techniques (categories only, not specific tool versions for legal reasons)
- Rules of engagement and safety procedures

ATTACK NARRATIVE: The most compelling section — tell the story of the engagement:
- Open with the highest-impact attack chain discovered
- Walk through the kill chain step by step (reconnaissance → initial access → privilege escalation → impact)
- Use technical detail but frame everything in terms of business risk
- Highlight defensive gaps exploited at each stage
- End with a paragraph on systemic root causes and architectural recommendations
- Use markdown headers, numbered steps for attack chains, and code blocks for key payloads

Return ONLY a valid JSON object — no preamble, no explanation:
{
  "title": "Full professional report title",
  "executiveSummary": "Complete markdown executive summary with risk table and recommendations",
  "methodology": "Complete markdown methodology section",
  "attackNarrative": "Complete markdown attack narrative with kill chain walkthrough"
}`;

function buildFindingUserMessage(ctx: FindingGenerationContext): string {
  return `Generate a complete, professional penetration testing finding for the following vulnerability.

VULNERABILITY TITLE: ${ctx.title}
${ctx.projectName ? `TARGET / PROJECT: ${ctx.projectName}` : ''}
${ctx.assets ? `AFFECTED ASSETS: ${ctx.assets}` : ''}
${ctx.description ? `\nTESTER NOTES & DESCRIPTION:\n${ctx.description}` : ''}
${ctx.reproduction ? `\nREPRODUCTION STEPS (tester's draft — expand and professionalise):\n${ctx.reproduction}` : ''}
${ctx.notes ? `\nENGAGEMENT CONTEXT (project notes — use to tailor business impact, client context, and remediation advice):\n${ctx.notes}` : ''}

Produce a publication-quality finding entry. Be technically precise, include realistic examples, and ensure the business impact is clear to a non-technical executive.`;
}

function buildSummaryUserMessage(ctx: ExecutiveSummaryContext): string {
  const findingsList = ctx.findings.map((f, i) =>
    `${i + 1}. [${f.severity.toUpperCase()}] ${f.title}${f.cwe ? ` (${f.cwe})` : ''}${f.cvss ? ` — CVSS ${f.cvss}` : ''}
   Description: ${f.description?.slice(0, 300) || 'Not provided'}
   Impact: ${f.impact?.slice(0, 250) || 'Not specified'}
   Remediation summary: ${f.remediation?.slice(0, 200) || 'Not specified'}`
  ).join('\n\n');

  const critHighFindings = ctx.findings
    .filter(f => f.severity === 'critical' || f.severity === 'high')
    .map(f => `- [${f.severity.toUpperCase()}] ${f.title}`)
    .join('\n');

  return `Produce a complete executive summary, methodology, and attack narrative for the following penetration test.

PROJECT: ${ctx.projectName}
ENGAGEMENT TYPE: ${ctx.engagement}
${ctx.startDate ? `TESTING PERIOD: ${ctx.startDate} — ${ctx.endDate}` : ''}
COMPOSITE RISK SCORE: ${ctx.riskScore.toFixed(1)}/10

FINDING DISTRIBUTION:
- Critical: ${ctx.counts.critical ?? 0}
- High:     ${ctx.counts.high ?? 0}
- Medium:   ${ctx.counts.medium ?? 0}
- Low:      ${ctx.counts.low ?? 0}
- Info:     ${ctx.counts.info ?? 0}
- TOTAL:    ${ctx.findings.length}

CRITICAL & HIGH SEVERITY FINDINGS:
${critHighFindings || 'None'}

ALL FINDINGS (full detail):
${findingsList}
${ctx.notes ? `\nENGAGEMENT NOTES (tester context — use to add accuracy and specificity to the narrative):\n${ctx.notes}` : ''}

Write a board-ready report that a CISO can present to executives, while containing enough technical detail for the engineering team. Be specific about business risks, regulatory implications, and prioritised remediation.`;
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

    let headers: Record<string, string>;
    if (config.bedrockApiKey) {
      // API key auth — no SigV4 needed
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': config.bedrockApiKey,
      };
    } else {
      // IAM SigV4 signing
      headers = await signBedrockRequest('POST', url, body, region, config.accessKeyId || '', config.secretAccessKey || '');
    }

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
    title:        parsed.title        || 'Security Finding',
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
    title:             parsed.title || 'Security Assessment Report',
    executiveSummary: parsed.executiveSummary || '',
    methodology:      parsed.methodology      || '',
    attackNarrative:  parsed.attackNarrative  || '',
  };
}
