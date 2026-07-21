/**
 * script-validator.js — lightweight, dependency-free validation of generated
 * test scripts before they're returned to the user. Pure functions so they can
 * be unit-tested and reused by the background service worker.
 *
 * We can't fully compile Java/Python/C# in a service worker, so validation is:
 *   - JS-family (Playwright/Cypress/Puppeteer/Selenium-JS/TS): real syntax check
 *     via `new Function` after stripping module-level import/export lines.
 *   - All languages: balanced-delimiter check + framework signature presence +
 *     a pathological-verbosity guard.
 */

const FRAMEWORK_SIGNATURES = {
  playwright: [/test\s*\(|it\s*\(|describe\s*\(/],
  cypress: [/describe\s*\(|it\s*\(|cy\./],
  selenium: [/def\s+test_|@Test|testRecordedFlow|class\s+\w+Test|IWebDriver|webdriver/i],
  puppeteer: [/puppeteer|browser\.|page\./]
};

const JS_LANGUAGES = new Set(['javascript', 'typescript', 'js', 'ts', undefined, null, '']);

function isJsFamily(framework, language) {
  if (framework === 'cypress' || framework === 'puppeteer') return true;
  if (framework === 'playwright') return true; // JS or TS
  if (framework === 'selenium') return language === 'javascript' || language === 'js';
  return JS_LANGUAGES.has(language);
}

/** Balanced (), {}, [] check ignoring delimiters inside strings/comments. */
function hasBalancedDelimiters(code) {
  const pairs = { ')': '(', '}': '{', ']': '[' };
  const opens = new Set(['(', '{', '[']);
  const stack = [];
  let inStr = null;       // ' " `
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    const prev = code[i - 1];
    const next = code[i + 1];

    if (inLineComment) { if (c === '\n') inLineComment = false; continue; }
    if (inBlockComment) { if (c === '*' && next === '/') { inBlockComment = false; i++; } continue; }
    if (inStr) {
      if (c === '\\') { i++; continue; }        // skip escaped char
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '/' && next === '/') { inLineComment = true; i++; continue; }
    if (c === '/' && next === '*') { inBlockComment = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '#' ) { inLineComment = true; continue; } // python/# comments

    if (opens.has(c)) stack.push(c);
    else if (pairs[c]) {
      if (stack.pop() !== pairs[c]) return false;
    }
  }
  return stack.length === 0 && !inStr && !inBlockComment;
}

/** Strip ES module + Python/Java/C# top-level import lines so `new Function` can parse. */
function stripImports(code) {
  return code
    .split('\n')
    .filter(line => {
      const t = line.trim();
      return !/^import\s/.test(t) &&
             !/^export\s+(default\s+)?/.test(t) &&
             !/^from\s+[\w'".]+\s+import\s/.test(t) &&
             !/^using\s+[\w.]+;/.test(t) &&
             !/^package\s+[\w.]+;/.test(t) &&
             !/^const\s+\{[^}]*\}\s*=\s*require\(/.test(t);
    })
    .join('\n');
}

function jsSyntaxError(code) {
  const stripped = stripImports(code);
  try {
    // Wrap in an async function body so top-level await is legal. Compiles
    // (parses) but does NOT execute the code.
    // eslint-disable-next-line no-new-func
    new Function(`return (async () => {\n${stripped}\n})`);
    return null;
  } catch (e) {
    return e.message || 'Syntax error';
  }
}

/**
 * Strip markdown code fences the model may have wrapped the script in
 * (```js ... ```). Returns clean code — we sanitize rather than reject, since
 * fenced output is otherwise perfectly usable.
 */
function stripCodeFences(code) {
  if (!code || typeof code !== 'string') return code;
  let out = code.trim();
  // Opening fence: ``` or ```lang on the first line.
  out = out.replace(/^```[a-zA-Z0-9]*\s*\n?/, '');
  // Closing fence at the end.
  out = out.replace(/\n?```\s*$/, '');
  return out.trim();
}

/**
 * HARD validation — problems that make the output genuinely unusable, so we
 * fall back to the template. Kept to the two checks that essentially never
 * false-positive on real model output: empty/too-short, and wrong/missing
 * framework signature. (Delimiter balance and JS parsing are prone to false
 * positives on regex literals / TS syntax, so they're SOFT signals only.)
 * Assumes fences already stripped. Returns a reason string, or null if usable.
 */
function hardInvalidReason(code, framework) {
  if (!code || typeof code !== 'string' || code.trim().length < 40) {
    return 'empty_or_too_short';
  }
  const sigs = FRAMEWORK_SIGNATURES[framework] || [/.+/];
  if (!sigs.some(re => re.test(code))) {
    return 'missing_framework_signature';
  }
  return null;
}

/**
 * FULL validation (hard + soft). Soft issues — a JS parse error (which can be a
 * false positive on TypeScript output) or excessive verbosity — are worth ONE
 * corrective retry but must NOT by themselves discard structurally-valid AI
 * output. Used only to decide whether to retry; template fallback is gated by
 * hardInvalidReason().
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateGeneratedScript(code, framework, language, actionCount = 0) {
  const hard = hardInvalidReason(code, framework);
  if (hard) return { valid: false, reason: hard };

  if (isJsFamily(framework, language)) {
    const err = jsSyntaxError(code);
    if (err) return { valid: false, reason: `js_syntax_error: ${err}` };
  }

  if (actionCount > 0) {
    const lines = code.split('\n').filter(l => l.trim()).length;
    if (lines > Math.max(200, actionCount * 20)) {
      return { valid: false, reason: 'excessive_length' };
    }
  }

  return { valid: true };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { validateGeneratedScript, hardInvalidReason, stripCodeFences, hasBalancedDelimiters, stripImports, isJsFamily };
}
