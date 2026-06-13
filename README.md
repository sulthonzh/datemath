# datemath

Zero-dependency date math expression parser for Node.js.

Add/subtract durations, snap to calendar boundaries, count business days, chain operations with pipes — all from a simple expression string.

## Install

```bash
npm install datemath
```

## Why

Every scheduling app, cron job, and report generator eventually needs date math. Most reach for `moment.js` (huge) or write fragile `new Date(Date.now() + 3 * 86400000)` code that breaks on month boundaries, daylight saving, and leap years.

`datemath` gives you a clean expression language that handles all of that correctly:

```
"now + 3 days"
"now / month"           → start of current month
"business_days(5)"      → 5 working days from now
"now | + 10 days | / month"  → add 10 days, snap to month start
```

## Usage

### Library

```js
const { compute } = require('datemath');

// Basic arithmetic
compute('now + 3 days');              // 3 days from now
compute('now - 2 weeks');             // 2 weeks ago
compute('now + 1 month');             // Next month same day
compute('now + 1 quarter');           // 3 months from now

// Snap to calendar boundaries
compute('now / day');                 // Midnight today (UTC)
compute('now / week');                // Start of this week (Sunday)
compute('now / month');              // First day of month
compute('now / quarter');            // First day of quarter
compute('now / year');               // January 1st

// Business days
compute('business_days(5)');         // 5 working days from now
compute('business_days(-3)');        // 3 working days ago

// With custom weekend (Fri-Sat in Middle East)
compute('business_days(5)', { weekend: [5, 6] });

// With holidays
compute('business_days(5)', {
  holidays: ['2024-07-04', '2024-12-25']
});

// Keywords
compute('today');                    // Midnight today
compute('tomorrow');                 // Midnight tomorrow
compute('yesterday');               // Midnight yesterday

// Pipes — chain operations
compute('now | + 10 days / month');  // Add 10 days, snap to month start
compute('now / day | + 6 hours');    // Midnight + 6 hours

// Specific dates
compute('"2024-01-15" + 7 days');   // Jan 22, 2024
compute('"2024-03-15" - 1 month');  // Feb 15, 2024

// Functions
compute('start_of(week)');           // Start of current week
compute('end_of(month)');            // Last moment of current month
compute('end_of(quarter) + 30 days'); // 30 days after quarter ends
compute('min("2024-01-01", "2024-06-01")');  // Earlier date
compute('max("2024-01-01", "2024-06-01")');  // Later date
```

### With a reference date

```js
compute('now + 3 days', {
  now: new Date('2024-06-15')  // treat this as "now"
});
```

### CLI

```bash
$ datemath "now + 3 days"
2024-06-18T10:30:00.000Z

$ datemath "now / month" --format date
2024-06-01

$ datemath "business_days(5)" --ref "2024-06-14"
2024-06-21T10:00:00.000Z

$ datemath "now + 1 year" --json
{"expression":"now + 1 year","result":"2025-06-15T10:30:00.000Z","timestamp":1750000200000}
```

## Expression Syntax

| Syntax | Meaning | Example |
|--------|---------|---------|
| `N unit` | Duration | `3 days`, `2 hours`, `1 month` |
| `now + N unit` | Add duration | `now + 3 days` |
| `now - N unit` | Subtract duration | `now - 1 week` |
| `expr / unit` | Snap to boundary | `now / month` |
| `expr \| op` | Pipe (chain) | `now \| + 3 days \| / month` |
| `func(args)` | Function call | `business_days(5)` |
| `"date"` | Specific date | `"2024-01-15"` |

### Units

`ms` `s`/`sec` `m`/`min` `h`/`hr` `d`/`day` `w`/`wk` `mo`/`month` `q`/`quarter` `y`/`yr`/`year`

(All support singular and plural forms.)

### Keywords

- `now` — current time
- `today` — start of today
- `tomorrow` — start of tomorrow
- `yesterday` — start of yesterday

### Functions

- `business_days(N)` — add N working days (respects weekends + holidays)
- `start_of(unit)` — start of current period
- `end_of(unit)` — end of current period
- `add(amount, unit)` — add a duration
- `min(d1, d2, ...)` — earliest date
- `max(d1, d2, ...)` — latest date

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `now` | `Date` | `new Date()` | Reference date for `now` |
| `weekend` | `number[]` | `[0, 6]` | Weekend day indices (0=Sun..6=Sat) |
| `holidays` | `(Date\|string)[]` | `[]` | Holidays to skip for business days |

## API

### `compute(expr, opts?)` → `Date`

Parse and evaluate a date math expression.

### `parse(expr)` → `Object`

Parse expression into an AST (for inspection/validation without evaluating).

### `evaluate(ast, opts?)` → `Date`

Evaluate a pre-parsed AST.

### `lex(expr)` → `Token[]`

Tokenize an expression (for tooling/debugging).

## Edge Cases Handled

- **Month overflow**: Jan 31 + 1 month → Feb 28/29 (snap to last day)
- **Leap years**: Feb 29 + 1 year → Feb 28 (non-leap) or Feb 29 (leap)
- **Business days**: Skips weekends and custom holidays
- **Quarter boundaries**: Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec

## Zero Dependencies

No `moment`, no `date-fns`, no `luxon`. Just pure JavaScript with correct calendar math.

## License

MIT
