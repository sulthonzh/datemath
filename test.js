'use strict';

const assert = require('assert');
const { compute, parse, lex, evaluate, getUnits, _internals } = require('./index.js');

const TEST_NOW = new Date('2024-06-15T10:30:00.000Z'); // Saturday, June 15, 2024
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`✗ ${name}: ${e.message}`);
  }
}

function approxEqual(a, b, tolerance = 1000) {
  return Math.abs(a - b) <= tolerance;
}

// ── Lexer Tests ────────────────────────────────────────────────

test('lex: simple addition', () => {
  const tokens = lex('now + 3 days');
  assert.strictEqual(tokens.length, 4);
  assert.strictEqual(tokens[0].type, 'identifier');
  assert.strictEqual(tokens[0].value, 'now');
  assert.strictEqual(tokens[1].type, 'op');
  assert.strictEqual(tokens[2].type, 'number');
  assert.strictEqual(tokens[2].value, 3);
  assert.strictEqual(tokens[3].type, 'identifier');
  assert.strictEqual(tokens[3].value, 'days');
});

test('lex: function call', () => {
  const tokens = lex('business_days(5)');
  assert.strictEqual(tokens[0].type, 'func');
  assert.strictEqual(tokens[0].value, 'business_days');
  assert.strictEqual(tokens[1].type, 'lparen');
  assert.strictEqual(tokens[2].type, 'number');
  assert.strictEqual(tokens[3].type, 'rparen');
});

test('lex: slash operator', () => {
  const tokens = lex('now / month');
  assert.strictEqual(tokens[1].type, 'slash');
});

test('lex: pipe operator', () => {
  const tokens = lex('now | + 3 days');
  assert.strictEqual(tokens[1].type, 'pipe');
});

test('lex: decimal number', () => {
  const tokens = lex('1.5 hours');
  assert.strictEqual(tokens[0].value, 1.5);
});

test('lex: quoted date string', () => {
  const tokens = lex('"2024-01-15" + 1 day');
  assert.strictEqual(tokens[0].type, 'string');
  assert.strictEqual(tokens[0].value, '2024-01-15');
});

test('lex: throws on unexpected char', () => {
  assert.throws(() => lex('now @ 3'), /Unexpected character/);
});

// ── Parser Tests ───────────────────────────────────────────────

test('parse: now expression', () => {
  const ast = parse('now');
  assert.strictEqual(ast.type, 'now');
});

test('parse: addition', () => {
  const ast = parse('now + 3 days');
  assert.strictEqual(ast.type, 'binop');
  assert.strictEqual(ast.op, '+');
  assert.strictEqual(ast.left.type, 'now');
  assert.strictEqual(ast.right.type, 'duration');
  assert.strictEqual(ast.right.amount, 3);
  assert.strictEqual(ast.right.unit, 'day');
});

test('parse: subtraction', () => {
  const ast = parse('now - 2 weeks');
  assert.strictEqual(ast.op, '-');
  assert.strictEqual(ast.right.amount, 2);
  assert.strictEqual(ast.right.unit, 'week');
});

test('parse: snap', () => {
  const ast = parse('now / month');
  assert.strictEqual(ast.type, 'snap');
  assert.strictEqual(ast.target, 'month');
});

test('parse: pipe', () => {
  const ast = parse('now | + 3 days');
  assert.strictEqual(ast.type, 'pipe');
});

test('parse: function', () => {
  const ast = parse('business_days(5)');
  assert.strictEqual(ast.type, 'func');
  assert.strictEqual(ast.name, 'business_days');
  assert.strictEqual(ast.args.length, 1);
});

test('parse: nested expression', () => {
  const ast = parse('now + 1 day + 2 hours');
  assert.strictEqual(ast.type, 'binop');
  // left-associative: (now + 1 day) + 2 hours
  assert.strictEqual(ast.left.type, 'binop');
});

test('parse: keyword today', () => {
  const ast = parse('today');
  assert.strictEqual(ast.type, 'snap');
  assert.strictEqual(ast.target, 'day');
});

test('parse: keyword tomorrow', () => {
  const ast = parse('tomorrow');
  assert.strictEqual(ast.type, 'binop');
  assert.strictEqual(ast.op, '+');
});

test('parse: keyword yesterday', () => {
  const ast = parse('yesterday');
  assert.strictEqual(ast.type, 'binop');
  assert.strictEqual(ast.op, '-');
});

test('parse: throws on unknown unit', () => {
  assert.throws(() => parse('now + 3 blorps'), /Unknown unit/);
});

test('parse: bare number in binop context', () => {
  // Now + 3 without unit should parse (bare number) but fail at eval
  assert.throws(() => compute('now + 3', { now: TEST_NOW }), /Unknown node type|Cannot apply/);
});

// ── Basic Arithmetic Tests ─────────────────────────────────────

test('eval: now returns reference', () => {
  const result = compute('now', { now: TEST_NOW });
  assert.strictEqual(result.getTime(), TEST_NOW.getTime());
});

test('eval: add milliseconds', () => {
  const result = compute('now + 500 ms', { now: TEST_NOW });
  assert.strictEqual(result.getTime(), TEST_NOW.getTime() + 500);
});

test('eval: add seconds', () => {
  const result = compute('now + 30 s', { now: TEST_NOW });
  assert.strictEqual(result.getTime(), TEST_NOW.getTime() + 30000);
});

test('eval: add minutes', () => {
  const result = compute('now + 5 minutes', { now: TEST_NOW });
  assert.strictEqual(result.getTime(), TEST_NOW.getTime() + 5 * 60 * 1000);
});

test('eval: add hours', () => {
  const result = compute('now + 2 hours', { now: TEST_NOW });
  assert.strictEqual(result.getTime(), TEST_NOW.getTime() + 2 * 60 * 60 * 1000);
});

test('eval: add days', () => {
  const result = compute('now + 3 days', { now: TEST_NOW });
  assert.strictEqual(result.getUTCDate(), 18);
  assert.strictEqual(result.getUTCMonth(), 5); // June
});

test('eval: subtract days', () => {
  const result = compute('now - 3 days', { now: TEST_NOW });
  assert.strictEqual(result.getUTCDate(), 12);
});

test('eval: add weeks', () => {
  const result = compute('now + 1 week', { now: TEST_NOW });
  assert.strictEqual(result.getUTCDate(), 22);
});

test('eval: subtract weeks', () => {
  const result = compute('now - 2 weeks', { now: TEST_NOW });
  assert.strictEqual(result.getUTCDate(), 1);
});

test('eval: add months', () => {
  const result = compute('now + 1 month', { now: TEST_NOW });
  assert.strictEqual(result.getUTCMonth(), 6); // July
  assert.strictEqual(result.getUTCDate(), 15);
});

test('eval: add months with overflow (Jan 31 + 1 month)', () => {
  const jan31 = new Date('2024-01-31T10:00:00Z');
  const result = compute('now + 1 month', { now: jan31 });
  assert.strictEqual(result.getUTCMonth(), 1); // Feb
  assert.strictEqual(result.getUTCDate(), 29); // leap year, Feb 29
});

test('eval: subtract months', () => {
  const result = compute('now - 1 month', { now: TEST_NOW });
  assert.strictEqual(result.getUTCMonth(), 4); // May
});

test('eval: add quarters', () => {
  const result = compute('now + 1 quarter', { now: TEST_NOW });
  assert.strictEqual(result.getUTCMonth(), 8); // September
});

test('eval: add years', () => {
  const result = compute('now + 1 year', { now: TEST_NOW });
  assert.strictEqual(result.getUTCFullYear(), 2025);
});

test('eval: subtract years', () => {
  const result = compute('now - 5 years', { now: TEST_NOW });
  assert.strictEqual(result.getUTCFullYear(), 2019);
});

test('eval: combined expression', () => {
  const result = compute('now + 1 day + 2 hours', { now: TEST_NOW });
  const expected = new Date('2024-06-16T12:30:00.000Z');
  assert.strictEqual(result.getTime(), expected.getTime());
});

test('eval: chained subtraction', () => {
  const result = compute('now - 1 week - 1 day', { now: TEST_NOW });
  assert.strictEqual(result.getUTCDate(), 7); // June 7
});

// ── Snap Tests ─────────────────────────────────────────────────

test('snap: start of second', () => {
  const result = compute('now / second', { now: TEST_NOW });
  assert.strictEqual(result.getUTCMilliseconds(), 0);
});

test('snap: start of minute', () => {
  const result = compute('now / minute', { now: TEST_NOW });
  assert.strictEqual(result.getUTCSeconds(), 0);
  assert.strictEqual(result.getUTCMilliseconds(), 0);
});

test('snap: start of hour', () => {
  const result = compute('now / hour', { now: TEST_NOW });
  assert.strictEqual(result.getUTCMinutes(), 0);
  assert.strictEqual(result.getUTCSeconds(), 0);
});

test('snap: start of day', () => {
  const result = compute('now / day', { now: TEST_NOW });
  assert.strictEqual(result.getUTCHours(), 0);
  assert.strictEqual(result.getUTCMinutes(), 0);
  assert.strictEqual(result.getUTCSeconds(), 0);
});

test('snap: start of week (Sunday)', () => {
  // June 15, 2024 is a Saturday → start of week = June 9 (Sunday)
  const result = compute('now / week', { now: TEST_NOW });
  assert.strictEqual(result.getUTCDay(), 0); // Sunday
  assert.strictEqual(result.getUTCDate(), 9);
});

test('snap: start of month', () => {
  const result = compute('now / month', { now: TEST_NOW });
  assert.strictEqual(result.getUTCDate(), 1);
  assert.strictEqual(result.getUTCMonth(), 5); // June
});

test('snap: start of quarter', () => {
  const result = compute('now / quarter', { now: TEST_NOW });
  // Q3 starts April 1
  assert.strictEqual(result.getUTCMonth(), 3); // April
  assert.strictEqual(result.getUTCDate(), 1);
});

test('snap: start of year', () => {
  const result = compute('now / year', { now: TEST_NOW });
  assert.strictEqual(result.getUTCMonth(), 0);
  assert.strictEqual(result.getUTCDate(), 1);
  assert.strictEqual(result.getUTCFullYear(), 2024);
});

// ── Keyword Tests ──────────────────────────────────────────────

test('keyword: today', () => {
  const result = compute('today', { now: TEST_NOW });
  assert.strictEqual(result.getUTCHours(), 0);
  assert.strictEqual(result.getUTCDate(), 15);
});

test('keyword: tomorrow', () => {
  const result = compute('tomorrow', { now: TEST_NOW });
  assert.strictEqual(result.getUTCHours(), 0);
  assert.strictEqual(result.getUTCDate(), 16);
});

test('keyword: yesterday', () => {
  const result = compute('yesterday', { now: TEST_NOW });
  assert.strictEqual(result.getUTCHours(), 0);
  assert.strictEqual(result.getUTCDate(), 14);
});

// ── Business Days Tests ────────────────────────────────────────

test('business_days: add 1 bday on Friday → Monday', () => {
  const friday = new Date('2024-06-14T10:00:00Z'); // Friday
  const result = compute('business_days(1)', { now: friday });
  assert.strictEqual(result.getUTCDay(), 1); // Monday
  assert.strictEqual(result.getUTCDate(), 17);
});

test('business_days: add 1 bday on Monday → Tuesday', () => {
  const monday = new Date('2024-06-17T10:00:00Z');
  const result = compute('business_days(1)', { now: monday });
  assert.strictEqual(result.getUTCDay(), 2); // Tuesday
  assert.strictEqual(result.getUTCDate(), 18);
});

test('business_days: add 5 bdays from Friday', () => {
  const friday = new Date('2024-06-14T10:00:00Z');
  const result = compute('business_days(5)', { now: friday });
  // Fri + 5 bdays = next Friday
  assert.strictEqual(result.getUTCDay(), 5); // Friday
  assert.strictEqual(result.getUTCDate(), 21);
});

test('business_days: subtract 5 bdays', () => {
  const friday = new Date('2024-06-14T10:00:00Z');
  const result = compute('business_days(-5)', { now: friday });
  assert.strictEqual(result.getUTCDate(), 7); // Previous Friday
});

test('business_days: with holiday', () => {
  const monday = new Date('2024-06-17T10:00:00Z');
  const wednesdayHoliday = [new Date('2024-06-19T00:00:00Z')];
  const result = compute('business_days(2)', { now: monday, holidays: wednesdayHoliday });
  // Mon → (skip Wed) → Thu
  assert.strictEqual(result.getUTCDate(), 20);
});

test('business_days: zero', () => {
  const result = compute('business_days(0)', { now: TEST_NOW });
  assert.strictEqual(result.getTime(), TEST_NOW.getTime());
});

// ── Pipe Tests ─────────────────────────────────────────────────

test('pipe: add then snap', () => {
  // now + 10 days | / month → snap to start of the resulting month
  const result = compute('now | + 10 days | / month', { now: TEST_NOW });
  // June 15 + 10 days = June 25 → snap to start → June 1
  assert.strictEqual(result.getUTCDate(), 1);
  assert.strictEqual(result.getUTCMonth(), 5);
});

test('pipe: snap then add', () => {
  const result = compute('now / day | + 6 hours', { now: TEST_NOW });
  // Start of June 15 UTC + 6 hours = 06:00 UTC
  assert.strictEqual(result.getUTCHours(), 6);
  assert.strictEqual(result.getUTCDate(), 15);
});

// ── Functions Tests ────────────────────────────────────────────

test('func: start_of(day)', () => {
  const result = compute('start_of(day)', { now: TEST_NOW });
  assert.strictEqual(result.getUTCHours(), 0);
});

test('func: end_of(month)', () => {
  const result = compute('end_of(month)', { now: TEST_NOW });
  assert.strictEqual(result.getUTCDate(), 30); // June has 30 days
  assert.strictEqual(result.getUTCHours(), 23);
});

test('func: end_of(year)', () => {
  const result = compute('end_of(year)', { now: TEST_NOW });
  assert.strictEqual(result.getUTCMonth(), 11);
  assert.strictEqual(result.getUTCDate(), 31);
});

test('func: add(3, days)', () => {
  const result = compute('add(3, days)', { now: TEST_NOW });
  assert.strictEqual(result.getUTCDate(), 18);
});

test('func: min of two dates', () => {
  const result = compute('min("2024-01-01", "2024-06-01")', { now: TEST_NOW });
  assert.strictEqual(result.getUTCMonth(), 0); // January
});

test('func: max of two dates', () => {
  const result = compute('max("2024-01-01", "2024-06-01")', { now: TEST_NOW });
  assert.strictEqual(result.getUTCMonth(), 5); // June
});

// ── Date String Tests ──────────────────────────────────────────

test('date string: parse and add', () => {
  const result = compute('"2024-01-15" + 7 days');
  assert.strictEqual(result.getUTCDate(), 22);
  assert.strictEqual(result.getUTCMonth(), 0);
});

test('date string: subtract from specific date', () => {
  const result = compute('"2024-03-15" - 1 month');
  assert.strictEqual(result.getUTCMonth(), 1); // February
  assert.strictEqual(result.getUTCDate(), 15);
});

// ── Complex Expressions ────────────────────────────────────────

test('complex: end of quarter + 30 days', () => {
  const result = compute('end_of(quarter) + 30 days', { now: TEST_NOW });
  // Q2 ends June 30 → +30 days = July 30
  assert.strictEqual(result.getUTCMonth(), 6); // July
  assert.strictEqual(result.getUTCDate(), 30);
});

test('complex: start of year + 5 months + 15 days', () => {
  const result = compute('start_of(year) + 5 months + 15 days', { now: TEST_NOW });
  assert.strictEqual(result.getUTCMonth(), 5); // June
  assert.strictEqual(result.getUTCDate(), 16);
});

test('complex: business_days + snap', () => {
  const monday = new Date('2024-06-17T10:00:00Z');
  const result = compute('business_days(3) / day', { now: monday });
  // Mon + 3 bdays = Thu → snap to start of day
  assert.strictEqual(result.getUTCDate(), 20);
  assert.strictEqual(result.getUTCHours(), 0);
});

test('complex: parenthesized expression', () => {
  const result = compute('(now + 1 day) + 1 day', { now: TEST_NOW });
  assert.strictEqual(result.getUTCDate(), 17);
});

// ── Edge Cases ─────────────────────────────────────────────────

test('edge: negative duration', () => {
  const result = compute('now + -1 day', { now: TEST_NOW });
  assert.strictEqual(result.getUTCDate(), 14);
});

test('edge: leap year Feb 29 + 1 year', () => {
  const feb29 = new Date('2024-02-29T10:00:00Z');
  const result = compute('now + 1 year', { now: feb29 });
  // JS Date wraps Feb 29 → Mar 1 in non-leap year
  assert.strictEqual(result.getUTCFullYear(), 2025);
});

test('edge: month overflow Jan 31 + 1 month', () => {
  const jan31 = new Date('2024-01-31T10:00:00Z');
  const result = compute('now + 1 month', { now: jan31 });
  // Should snap to Feb 29 (leap year, last day of month)
  assert.strictEqual(result.getUTCMonth(), 1);
  assert.strictEqual(result.getUTCDate(), 29);
});

test('edge: zero duration', () => {
  const result = compute('now + 0 days', { now: TEST_NOW });
  assert.strictEqual(result.getTime(), TEST_NOW.getTime());
});

test('edge: empty expression throws', () => {
  assert.throws(() => compute(''), /Unexpected end of input|Unexpected token/);
});

// ── Weekend config ─────────────────────────────────────────────

test('custom weekend: Friday-Saturday', () => {
  // In some countries weekend is Fri-Sat
  const sunday = new Date('2024-06-16T10:00:00Z'); // Sunday
  const result = compute('business_days(1)', { now: sunday, weekend: [5, 6] });
  // Sunday is a workday, Monday is a workday → result is Monday
  assert.strictEqual(result.getUTCDay(), 1);
  assert.strictEqual(result.getUTCDate(), 17);
});

// ── API Tests ──────────────────────────────────────────────────

test('API: getUnits returns all units', () => {
  const units = getUnits();
  assert(units.includes('day'));
  assert(units.includes('month'));
  assert(units.includes('millisecond'));
  assert(units.includes('quarter'));
});

test('API: parse returns AST', () => {
  const ast = parse('now + 1 day');
  assert.strictEqual(ast.type, 'binop');
});

test('API: lex returns tokens', () => {
  const tokens = lex('now');
  assert(Array.isArray(tokens));
});

test('API: evaluate with pre-parsed AST', () => {
  const ast = parse('now + 1 day');
  const result = evaluate(ast, { now: TEST_NOW });
  assert.strictEqual(result.getUTCDate(), 16);
});

test('internals: applyDuration', () => {
  const d = new Date('2024-06-15T10:00:00Z');
  const result = _internals.applyDuration(d, 3, 'day');
  assert.strictEqual(result.getUTCDate(), 18);
});

test('internals: addBusinessDays', () => {
  const d = new Date('2024-06-14T10:00:00Z'); // Friday
  const isBusinessDay = (date) => date.getDay() !== 0 && date.getDay() !== 6;
  const result = _internals.addBusinessDays(d, 1, isBusinessDay);
  assert.strictEqual(result.getUTCDay(), 1); // Monday
});

test('internals: snapToBoundary', () => {
  const d = new Date('2024-06-15T10:30:00Z');
  const result = _internals.snapToBoundary(d, 'month');
  assert.strictEqual(result.getUTCDate(), 1);
});

test('internals: stripTime', () => {
  const d = new Date('2024-06-15T10:30:00Z');
  const result = _internals.stripTime(d);
  assert.strictEqual(result.getHours(), 0);
  assert.strictEqual(result.getMinutes(), 0);
});

// ── Results ────────────────────────────────────────────────────

console.log(`\n${'='.repeat(50)}`);
console.log(`datemath tests: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(50)}`);
process.exit(failed > 0 ? 1 : 0);
