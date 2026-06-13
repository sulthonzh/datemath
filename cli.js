#!/usr/bin/env node
'use strict';

const { compute, toISO, toDate } = require('./index.js');

// ── Args ───────────────────────────────────────────────────────

function usage() {
  return `
datemath — date math expression evaluator

Usage:
  datemath "now + 3 days"
  datemath "now - 1 week / day"
  datemath "business_days(5)"
  datemath "now / month" --format date
  datemath "now + 1 year" --ref "2024-02-29"

Options:
  --format <iso|date|unix|object>  Output format (default: iso)
  --ref <date>                     Reference date for "now" (ISO string)
  --weekend <days>                 Weekend days, comma-separated 0=Sun..6=Sat (default: 0,6)
  --json                           Output as JSON object
  -h, --help                       Show this help

Expressions:
  now + 3 days                     Add 3 days
  now - 1 month                    Subtract 1 month
  now / month                      Snap to start of month
  now / week                       Snap to start of week (Sunday)
  business_days(5)                 Add 5 business days
  now + 2 business_days            Add 2 business days (alias)
  today + 1 week                   Start of today + 1 week
  tomorrow                         Tomorrow at start of day
  yesterday                        Yesterday at start of day
  now | + 3 days | / month         Pipe: add 3 days, then snap to month start

Units: ms, s, m, h, d, w, mo, q, y
       (millisecond, second, minute, hour, day, week, month, quarter, year)

Snap targets: second, minute, hour, day, week, month, quarter, year
`;
}

function parseArgs(argv) {
  const args = { expr: null, format: 'iso', ref: null, weekend: [0, 6], json: false };
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') {
      console.log(usage());
      process.exit(0);
    } else if (a === '--format') {
      args.format = argv[++i];
    } else if (a === '--ref') {
      args.ref = argv[++i];
    } else if (a === '--weekend') {
      args.weekend = argv[++i].split(',').map(n => parseInt(n.trim(), 10));
    } else if (a === '--json') {
      args.json = true;
    } else {
      positional.push(a);
    }
  }

  args.expr = positional.join(' ');
  return args;
}

// ── Main ───────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.expr) {
    console.error(usage());
    process.exit(1);
  }

  const opts = { weekend: args.weekend };
  if (args.ref) {
    opts.now = new Date(args.ref);
    if (isNaN(opts.now.getTime())) {
      console.error(`Invalid --ref date: ${args.ref}`);
      process.exit(1);
    }
  }

  let result;
  try {
    result = compute(args.expr, opts);
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }

  if (args.json) {
    console.log(JSON.stringify({
      expression: args.expr,
      result: toISO(result),
      timestamp: result.getTime(),
    }));
    return;
  }

  switch (args.format) {
    case 'iso':
      console.log(toISO(result));
      break;
    case 'date':
      console.log(toDate(result));
      break;
    case 'unix':
      console.log(Math.floor(result.getTime() / 1000));
      break;
    case 'object':
      console.log(JSON.stringify(result, null, 2));
      break;
    default:
      console.log(toISO(result));
  }
}

main();
