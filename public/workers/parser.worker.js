// Plain-JS worker served from /public. Runs lightweight syntax checks
// off the main thread so the editor stays at 60fps. No network, no deps.

const PAIRS = { ')': '(', ']': '[', '}': '{' };
const OPENERS = new Set(['(', '[', '{']);
const CLOSERS = new Set([')', ']', '}']);

function bracketCheck(code) {
  const diags = [];
  const stack = []; // {ch, line}
  let line = 1;
  let inStr = null; // '"' | "'" | '`' | null
  let inLine = false; // // comment
  let inBlock = false; // /* */
  let prev = '';

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const next = code[i + 1];

    if (ch === '\n') {
      line++;
      inLine = false;
      prev = ch;
      continue;
    }
    if (inLine) {
      prev = ch;
      continue;
    }
    if (inBlock) {
      if (ch === '*' && next === '/') {
        inBlock = false;
        i++;
      }
      prev = ch;
      continue;
    }
    if (inStr) {
      if (ch === '\\') {
        i++; // skip escape
      } else if (ch === inStr) {
        inStr = null;
      }
      prev = ch;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLine = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlock = true;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      prev = ch;
      continue;
    }

    if (OPENERS.has(ch)) {
      stack.push({ ch, line });
    } else if (CLOSERS.has(ch)) {
      const want = PAIRS[ch];
      const top = stack.pop();
      if (!top) {
        diags.push({ line, message: `unmatched '${ch}'`, severity: 'error' });
      } else if (top.ch !== want) {
        diags.push({
          line,
          message: `'${ch}' does not match '${top.ch}' opened on line ${top.line}`,
          severity: 'error',
        });
      }
    }
    prev = ch;
  }

  for (const open of stack) {
    diags.push({
      line: open.line,
      message: `unclosed '${open.ch}'`,
      severity: 'error',
    });
  }
  return diags;
}

function cppLint(code) {
  const diags = bracketCheck(code);
  const lines = code.split('\n');
  lines.forEach((ln, idx) => {
    const trimmed = ln.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) return;
    // crude "missing ;" heuristic: line ends with an identifier/) and isn't a
    // brace/label/control-flow header.
    if (
      /[\w)\]]$/.test(trimmed) &&
      !/^(if|else|for|while|do|switch|case|default|class|struct|namespace|template|public:|private:|protected:)\b/.test(
        trimmed
      ) &&
      !/[{};:,]$/.test(trimmed) &&
      !trimmed.endsWith('\\')
    ) {
      diags.push({
        line: idx + 1,
        message: 'possibly missing semicolon',
        severity: 'warn',
      });
    }
  });
  return diags;
}

function pyLint(code) {
  const diags = [];
  // Brackets only (Python uses indentation, semicolons optional).
  const bd = bracketCheck(code);
  diags.push(...bd);
  const lines = code.split('\n');
  lines.forEach((ln, idx) => {
    // mixed tabs/spaces at start
    if (/^\t+ +|^ +\t+/.test(ln)) {
      diags.push({
        line: idx + 1,
        message: 'mixed tabs and spaces in indentation',
        severity: 'warn',
      });
    }
    // colon-required headers
    const stripped = ln.trim();
    if (
      /^(if|elif|else|for|while|def|class|try|except|finally|with)\b/.test(
        stripped
      ) &&
      !stripped.endsWith(':') &&
      !stripped.endsWith('\\') &&
      stripped !== 'else' &&
      stripped !== 'try' &&
      stripped !== 'finally'
    ) {
      // tolerate single-word else/try/finally if user is mid-edit; only warn
      // if the line is long enough to be a real header
      if (stripped.length > 4) {
        diags.push({
          line: idx + 1,
          message: "compound statement likely missing ':'",
          severity: 'warn',
        });
      }
    }
  });
  return diags;
}

self.addEventListener('message', (e) => {
  const { runId, language, code } = e.data || {};
  let diagnostics = [];
  try {
    if (language === 'python') diagnostics = pyLint(code);
    else diagnostics = cppLint(code);
  } catch (err) {
    diagnostics = [
      { line: 1, message: 'parser crashed: ' + err.message, severity: 'warn' },
    ];
  }
  // Cap to keep UI snappy.
  diagnostics = diagnostics.slice(0, 25);
  self.postMessage({ runId, diagnostics });
});