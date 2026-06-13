'use strict';

// ═══════════════════════════════════════════════════════════════
// datemath — zero-dep date math expression parser
// ═══════════════════════════════════════════════════════════════

const MS_SECOND = 1000;
const MS_MINUTE = 60 * MS_SECOND;
const MS_HOUR = 60 * MS_MINUTE;
const MS_DAY = 24 * MS_HOUR;
const MS_WEEK = 7 * MS_DAY;

const UNITS = {
  ms: 'millisecond', millisecond: 'millisecond', milliseconds: 'millisecond',
  s: 'second', sec: 'second', second: 'second', seconds: 'second',
  m: 'minute', min: 'minute', minute: 'minute', minutes: 'minute',
  h: 'hour', hr: 'hour', hour: 'hour', hours: 'hour',
  d: 'day', day: 'day', days: 'day',
  w: 'week', wk: 'week', week: 'week', weeks: 'week',
  mo: 'month', month: 'month', months: 'month',
  q: 'quarter', quarter: 'quarter', quarters: 'quarter',
  y: 'year', yr: 'year', year: 'year', years: 'year',
};

const UNIT_MS = {
  millisecond: 1,
  second: MS_SECOND,
  minute: MS_MINUTE,
  hour: MS_HOUR,
  day: MS_DAY,
  week: MS_WEEK,
};

// ── Lexer ──────────────────────────────────────────────────────

/**
 * Tokenize a date math expression.
 * @param {string} input
 * @returns {Token[]}
 */
function lex(input) {
  const tokens = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i];

    // Skip whitespace
    if (/\s/.test(ch)) { i++; continue; }

    // Operators
    if (ch === '+' || ch === '-') {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }

    // Slash (for /snap)
    if (ch === '/') {
      tokens.push({ type: 'slash', value: ch });
      i++;
      continue;
    }

    // Comma (for ranges / args)
    if (ch === ',') {
      tokens.push({ type: 'comma', value: ch });
      i++;
      continue;
    }

    // Pipe (for chaining)
    if (ch === '|') {
      tokens.push({ type: 'pipe', value: ch });
      i++;
      continue;
    }

    // Parentheses
    if (ch === '(') { tokens.push({ type: 'lparen', value: ch }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'rparen', value: ch }); i++; continue; }

    // Numbers (including decimals)
    if (/[0-9]/.test(ch)) {
      let num = '';
      while (i < len && /[0-9.]/.test(input[i])) {
        num += input[i++];
      }
      tokens.push({ type: 'number', value: parseFloat(num) });
      continue;
    }

    // Identifiers: letters, underscores, hyphens within identifiers
    if (/[a-zA-Z_]/.test(ch)) {
      let id = '';
      while (i < len && /[a-zA-Z0-9_-]/.test(input[i])) {
        id += input[i++];
      }
      // Check for function call
      let j = i;
      while (j < len && /\s/.test(input[j])) j++;
      if (j < len && input[j] === '(') {
        tokens.push({ type: 'func', value: id.toLowerCase() });
      } else {
        tokens.push({ type: 'identifier', value: id.toLowerCase() });
      }
      continue;
    }

    // Quoted strings (for specific dates)
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let str = '';
      while (i < len && input[i] !== quote) {
        str += input[i++];
      }
      i++; // skip closing quote
      tokens.push({ type: 'string', value: str });
      continue;
    }

    throw new Error(`Unexpected character '${ch}' at position ${i}`);
  }

  return tokens;
}

// ── Parser (recursive descent) ─────────────────────────────────

/**
 * Parse a date math expression into an AST.
 * @param {string} input
 * @returns {Object} AST root node
 */
function parse(input) {
  const tokens = lex(input);
  let pos = 0;

  function peek() { return tokens[pos]; }
  function consume() { return tokens[pos++]; }
  function expect(type) {
    const tok = consume();
    if (!tok || tok.type !== type) {
      throw new Error(`Expected ${type} but got ${tok ? tok.type + ' (' + tok.value + ')' : 'end of input'}`);
    }
    return tok;
  }

  function parseExpression() {
    let left = parseTerm();

    while (pos < tokens.length) {
      const tok = peek();
      if (tok.type === 'pipe') {
        consume();
        // Check if right side starts with slash (snap applied to accumulated result)
        if (peek() && peek().type === 'slash') {
          consume();
          const snapTarget = parseSnap();
          left = { type: 'snap', expr: left, target: snapTarget };
        } else {
          let right = parseTerm();
          // Handle slash/snap after term in pipe right side
          while (peek() && peek().type === 'slash') {
            consume();
            const snapTarget = parseSnap();
            right = { type: 'snap', expr: right, target: snapTarget };
          }
          left = { type: 'pipe', left, right };
        }
      } else if (tok.type === 'slash') {
        consume();
        const snapNode = parseSnap();
        left = { type: 'snap', expr: left, target: snapNode };
      } else {
        break;
      }
    }

    return left;
  }

  function parseTerm() {
    let node = parseFactor();

    while (pos < tokens.length) {
      const tok = peek();
      if (tok && tok.type === 'op' && (tok.value === '+' || tok.value === '-')) {
        consume();
        const right = parseFactor();
        node = { type: 'binop', op: tok.value, left: node, right };
      } else {
        break;
      }
    }

    return node;
  }

  function parseFactor() {
    const tok = peek();
    if (!tok) throw new Error('Unexpected end of input');

    if (tok.type === 'op' && (tok.value === '+' || tok.value === '-')) {
      consume();
      const operand = parseFactor();
      return { type: 'unary', op: tok.value, operand };
    }

    if (tok.type === 'number') {
      consume();
      // Check if a unit identifier follows
      const unitTok = peek();
      if (unitTok && unitTok.type === 'identifier') {
        consume();
        const unit = UNITS[unitTok.value];
        if (!unit) {
          throw new Error(`Unknown unit '${unitTok.value}'`);
        }
        return { type: 'duration', amount: tok.value, unit };
      }
      // Bare number (e.g., function argument)
      return { type: 'number', value: tok.value };
    }

    if (tok.type === 'identifier') {
      consume();
      // Special keywords
      if (tok.value === 'now') {
        return { type: 'now' };
      }
      if (tok.value === 'today') {
        return { type: 'snap', expr: { type: 'now' }, target: 'day' };
      }
      if (tok.value === 'tomorrow') {
        return { type: 'binop', op: '+', left: { type: 'snap', expr: { type: 'now' }, target: 'day' }, right: { type: 'duration', amount: 1, unit: 'day' } };
      }
      if (tok.value === 'yesterday') {
        return { type: 'binop', op: '-', left: { type: 'snap', expr: { type: 'now' }, target: 'day' }, right: { type: 'duration', amount: 1, unit: 'day' } };
      }
      // Could be a unit used standalone (e.g. "month" in snap context)
      const unit = UNITS[tok.value];
      if (unit) {
        return { type: 'unit', unit };
      }
      throw new Error(`Unexpected identifier '${tok.value}'`);
    }

    if (tok.type === 'func') {
      return parseFunc();
    }

    if (tok.type === 'string') {
      consume();
      const parsed = new Date(tok.value);
      if (isNaN(parsed.getTime())) {
        throw new Error(`Invalid date string '${tok.value}'`);
      }
      return { type: 'date', value: parsed };
    }

    if (tok.type === 'lparen') {
      consume();
      const expr = parseExpression();
      expect('rparen');
      return expr;
    }

    throw new Error(`Unexpected token ${tok.type} (${tok.value})`);
  }

  function parseFunc() {
    const nameTok = consume(); // func token
    expect('lparen');
    const args = [];

    if (peek() && peek().type !== 'rparen') {
      args.push(parseExpression());
      while (peek() && peek().type === 'comma') {
        consume();
        args.push(parseExpression());
      }
    }

    expect('rparen');
    return { type: 'func', name: nameTok.value, args };
  }

  function parseSnap() {
    const tok = consume();
    if (!tok) throw new Error('Expected snap target after /');
    if (tok.type === 'identifier') {
      const unit = UNITS[tok.value];
      if (unit) {
        return unit;
      }
      throw new Error(`Unknown snap target '${tok.value}'`);
    }
    throw new Error(`Invalid snap target`);
  }

  const ast = parseExpression();
  if (pos < tokens.length) {
    throw new Error(`Unexpected token at position ${pos}: ${tokens[pos].type}`);
  }

  return ast;
}

// ── Evaluator ──────────────────────────────────────────────────

/**
 * Evaluate a date math AST.
 * @param {Object} ast — parsed AST from parse()
 * @param {Object} [opts] — options
 * @param {Date} [opts.now=new Date()] — reference "now" date
 * @param {number[]} [opts.weekend=[0,6]] — weekend day indices (0=Sun..6=Sat)
 * @param {Date[]} [opts.holidays=[]] — holiday dates to skip for business days
 * @returns {Date}
 */
function evaluate(ast, opts = {}) {
  const now = opts.now || new Date();
  const weekend = opts.weekend || [0, 6]; // Sun, Sat
  const holidays = (opts.holidays || []).map(d => {
    if (d instanceof Date) return stripTime(d).getTime();
    return stripTime(new Date(d)).getTime();
  });
  const holidaySet = new Set(holidays);

  function isWeekendDay(date) {
    return weekend.includes(date.getDay());
  }

  function isHoliday(date) {
    return holidaySet.has(stripTime(date).getTime());
  }

  function isBusinessDay(date) {
    return !isWeekendDay(date) && !isHoliday(date);
  }

  function evalNode(node) {
    switch (node.type) {
      case 'now':
        return new Date(now);

      case 'date':
        return new Date(node.value);

      case 'duration':
        return applyDuration(new Date(0), node.amount, node.unit, { isBusinessDay, weekend, holidaySet });

      case 'unit':
        // standalone unit (used in some contexts)
        return new Date(0); // shouldn't be called directly

      case 'unary': {
        const val = evalNode(node.operand);
        if (node.op === '-') {
          return new Date(-val.getTime());
        }
        return val;
      }

      case 'binop': {
        const left = evalNode(node.left);

        // If right side is a duration, apply it to left
        if (node.right.type === 'duration') {
          return applyDuration(left, node.op === '-' ? -node.right.amount : node.right.amount, node.right.unit, { isBusinessDay, weekend, holidaySet });
        }

        // If right is also a date/binop (rare), subtract dates
        const right = evalNode(node.right);
        if (node.op === '-') {
          return new Date(left.getTime() - right.getTime());
        }
        return new Date(left.getTime() + right.getTime());
      }

      case 'snap': {
        const date = evalNode(node.expr);
        return snapToBoundary(date, node.target);
      }

      case 'pipe': {
        // Evaluate left, then use result as "now" for right
        const leftResult = evalNode(node.left);
        // If right is a unary +/- expression, treat as binop with leftResult
        if (node.right.type === 'unary') {
          const amount = evalNum(node.right.operand, now);
          const unit = node.right.operand.unit || 'day';
          return applyDuration(leftResult, node.right.op === '-' ? -amount : amount, unit, { isBusinessDay, weekend, holidaySet });
        }
        // If right is a bare duration
        if (node.right.type === 'duration') {
          return applyDuration(leftResult, node.right.amount, node.right.unit, { isBusinessDay, weekend, holidaySet });
        }
        return evalNodeWithNow(node.right, leftResult);
      }

      case 'func': {
        return evalFunc(node);
      }

      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  function evalNodeWithNow(node, refDate) {
    // Re-evaluate a node with a different "now"
    const savedNow = now;
    // We can't reassign `now` since it's const, so we handle it inline
    if (node.type === 'now') return new Date(refDate);

    switch (node.type) {
      case 'now':
        return new Date(refDate);

      case 'binop': {
        const left = node.left.type === 'now' ? new Date(refDate) : evalNodeWithNow(node.left, refDate);
        if (node.right.type === 'duration') {
          return applyDuration(left, node.op === '-' ? -node.right.amount : node.right.amount, node.right.unit, { isBusinessDay, weekend, holidaySet });
        }
        const right = evalNodeWithNow(node.right, refDate);
        if (node.op === '-') return new Date(left.getTime() - right.getTime());
        return new Date(left.getTime() + right.getTime());
      }

      case 'snap': {
        const date = node.expr.type === 'now' ? new Date(refDate) : evalNodeWithNow(node.expr, refDate);
        return snapToBoundary(date, node.target);
      }

      case 'func':
        return evalFuncWithNow(node, refDate);

      case 'date':
        return new Date(node.value);

      default:
        return evalNode(node);
    }
  }

  function evalFunc(node) {
    return evalFuncWithNow(node, now);
  }

  function evalFuncWithNow(node, refNow) {
    const { name, args } = node;

    switch (name) {
      case 'business_days': case 'businessdays': case 'bdays': {
        // business_days(N) — add N business days to now
        const n = args.length ? evalNum(args[0], refNow) : 1;
        return addBusinessDays(new Date(refNow), n, isBusinessDay);
      }

      case 'start_of': case 'startof': {
        const unit = args.length ? resolveUnitArg(args[0]) : 'day';
        return snapToBoundary(new Date(refNow), unit, 'start');
      }

      case 'end_of': case 'endof': {
        const unit = args.length ? resolveUnitArg(args[0]) : 'day';
        return snapToBoundary(new Date(refNow), unit, 'end');
      }

      case 'age': {
        // age(date) — years since date
        const d = args.length ? evalNodeWithNow(args[0], refNow) : new Date(refNow);
        return new Date(dateAgeYears(d) * MS_YEAR);
      }

      case 'iso': {
        // iso("2024-01-15") — parse ISO date
        if (!args.length) throw new Error('iso() requires a date argument');
        const d = evalNodeWithNow(args[0], refNow);
        return d;
      }

      case 'min': case 'max': {
        if (!args.length) throw new Error(`${name}() requires at least one argument`);
        const dates = args.map(a => evalNodeWithNow(a, refNow));
        if (name === 'min') return new Date(Math.min(...dates.map(d => d.getTime())));
        return new Date(Math.max(...dates.map(d => d.getTime())));
      }

      case 'add': {
        // add(amount, unit) — returns duration applied to now
        if (args.length < 2) throw new Error('add() requires (amount, unit)');
        const amount = evalNum(args[0], refNow);
        const unit = resolveUnitArg(args[1]);
        return applyDuration(new Date(refNow), amount, unit, { isBusinessDay, weekend, holidaySet });
      }

      default:
        throw new Error(`Unknown function '${name}'`);
    }
  }

  function evalNum(node, refNow) {
    if (node.type === 'duration') return node.amount;
    if (node.type === 'number') return node.value;
    if (node.type === 'unary') {
      const val = evalNum(node.operand, refNow);
      return node.op === '-' ? -val : val;
    }
    const result = evalNodeWithNow(node, refNow);
    return result.getTime();
  }

  function resolveUnitArg(node) {
    if (node.type === 'identifier' || node.type === 'unit') {
      const u = UNITS[node.value || node.unit];
      if (!u) throw new Error(`Unknown unit '${node.value || node.unit}'`);
      return u;
    }
    if (node.type === 'duration') return node.unit;
    throw new Error('Expected a unit identifier');
  }

  const result = evalNode(ast);
  return result;
}

// ── Duration helpers ───────────────────────────────────────────

function applyDuration(date, amount, unit, ctx) {
  const result = new Date(date);

  switch (unit) {
    case 'millisecond':
      result.setTime(result.getTime() + amount);
      break;
    case 'second':
      result.setTime(result.getTime() + amount * MS_SECOND);
      break;
    case 'minute':
      result.setTime(result.getTime() + amount * MS_MINUTE);
      break;
    case 'hour':
      result.setTime(result.getTime() + amount * MS_HOUR);
      break;
    case 'day':
      result.setDate(result.getDate() + amount);
      break;
    case 'week':
      result.setDate(result.getDate() + amount * 7);
      break;
    case 'month': {
      const day = result.getDate();
      result.setMonth(result.getMonth() + amount);
      // Handle month overflow (e.g., Jan 31 + 1 month = Mar 3)
      // If day changed, it overflowed — snap to end of month
      if (result.getDate() !== day) {
        result.setDate(0); // last day of previous month
      }
      break;
    }
    case 'quarter':
      return applyDuration(result, amount * 3, 'month', ctx);
    case 'year':
      // Handle Feb 29 on non-leap years
      result.setFullYear(result.getFullYear() + amount);
      break;
    default:
      throw new Error(`Cannot apply duration with unit '${unit}'`);
  }

  return result;
}

function addBusinessDays(date, n, isBusinessDay) {
  const result = new Date(date);
  const direction = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);

  while (remaining > 0) {
    result.setDate(result.getDate() + direction);
    if (isBusinessDay(result)) {
      remaining--;
    }
  }

  return result;
}

// ── Snap helpers ───────────────────────────────────────────────

function snapToBoundary(date, unit, edge = 'start') {
  const result = new Date(date);

  switch (unit) {
    case 'millisecond':
      // Already at millisecond precision
      break;

    case 'second':
      if (edge === 'start') { result.setUTCMilliseconds(0); }
      else { result.setUTCMilliseconds(999); }
      break;

    case 'minute':
      if (edge === 'start') { result.setUTCSeconds(0, 0); }
      else { result.setUTCSeconds(59, 999); }
      break;

    case 'hour':
      if (edge === 'start') { result.setUTCMinutes(0, 0, 0); }
      else { result.setUTCMinutes(59, 59, 999); }
      break;

    case 'day':
      if (edge === 'start') { result.setUTCHours(0, 0, 0, 0); }
      else { result.setUTCHours(23, 59, 59, 999); }
      break;

    case 'week': {
      const day = result.getUTCDay(); // 0=Sun..6=Sat
      if (edge === 'start') {
        result.setUTCDate(result.getUTCDate() - day);
        result.setUTCHours(0, 0, 0, 0);
      } else {
        result.setUTCDate(result.getUTCDate() + (6 - day));
        result.setUTCHours(23, 59, 59, 999);
      }
      break;
    }

    case 'month':
      if (edge === 'start') {
        result.setUTCDate(1);
        result.setUTCHours(0, 0, 0, 0);
      } else {
        result.setUTCMonth(result.getUTCMonth() + 1, 0);
        result.setUTCHours(23, 59, 59, 999);
      }
      break;

    case 'quarter': {
      const month = result.getUTCMonth();
      const qStart = Math.floor(month / 3) * 3;
      if (edge === 'start') {
        result.setUTCMonth(qStart, 1);
        result.setUTCHours(0, 0, 0, 0);
      } else {
        result.setUTCMonth(qStart + 3, 0);
        result.setUTCHours(23, 59, 59, 999);
      }
      break;
    }

    case 'year':
      if (edge === 'start') {
        result.setUTCMonth(0, 1);
        result.setUTCHours(0, 0, 0, 0);
      } else {
        result.setUTCMonth(11, 31);
        result.setUTCHours(23, 59, 59, 999);
      }
      break;

    default:
      throw new Error(`Cannot snap to unit '${unit}'`);
  }

  return result;
}

// ── Utility helpers ────────────────────────────────────────────

function stripTime(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateAgeYears(date) {
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) {
    age--;
  }
  return age;
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Evaluate a date math expression.
 * @param {string} expr — e.g. "now + 3 days", "now / month", "business_days(5)"
 * @param {Object} [opts] — { now, weekend, holidays }
 * @returns {Date}
 */
function compute(expr, opts) {
  const ast = parse(expr);
  return evaluate(ast, opts);
}

/**
 * Parse a date math expression into an AST (for inspection/debugging).
 * @param {string} expr
 * @returns {Object}
 */
function parseExpression(expr) {
  return parse(expr);
}

/**
 * List all supported units.
 * @returns {string[]}
 */
function getUnits() {
  return [...new Set(Object.values(UNITS))];
}

/**
 * Format a date as ISO 8601 string.
 * @param {Date} date
 * @returns {string}
 */
function toISO(date) {
  return date.toISOString();
}

/**
 * Format a date as YYYY-MM-DD.
 * @param {Date} date
 * @returns {string}
 */
function toDate(date) {
  return date.toISOString().slice(0, 10);
}

module.exports = {
  compute,
  parse: parseExpression,
  evaluate,
  lex,
  getUnits,
  toISO,
  toDate,
  // expose internals for testing
  _internals: { applyDuration, addBusinessDays, snapToBoundary, stripTime, UNITS },
};
