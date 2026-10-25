/**
 * Meta Graph API Ad Interest Validator CLI
 * Part of @harness/skill-marketing
 */

import process from 'node:process';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    query: '',
    limit: 10,
    raw: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--raw') options.raw = true;
    else if ((arg === '--query' || arg === '-q') && args[i + 1]) options.query = args[++i];
    else if ((arg === '--limit' || arg === '-l') && args[i + 1]) options.limit = parseInt(args[++i], 10) || 10;
    else if (!options.query && !arg.startsWith('-')) options.query = arg;
  }
  return options;
}

function printHelp() {
  console.log(`
Meta Graph API Ad Interest Validator
Usage:
  node meta-interests.mjs --query <interest_keyword> [options]

Options:
  --query, -q    Interest keyword or topic to search (required)
  --limit, -l    Max suggestions to return [default: 10]
  --raw          Output raw JSON
  --help, -h     Show this help

Environment Variables:
  META_ACCESS_TOKEN   Meta User or System User Graph API access token
`);
}

async function main() {
  const options = parseArgs();

  if (options.help || !options.query) {
    printHelp();
    if (!options.query && !options.help) {
      console.error('Error: --query is required.');
      process.exit(1);
    }
    return;
  }

  const token = process.env.META_ACCESS_TOKEN;

  if (!token) {
    const errMessage = 'META_ACCESS_TOKEN environment variable is not configured. Live Meta ad interests cannot be validated.';
    if (options.raw) {
      console.error(JSON.stringify({ error: 'MISSING_ACCESS_TOKEN', message: errMessage }));
    } else {
      console.error(`Error: ${errMessage}`);
    }
    process.exit(1);
  }

  try {
    const url = `https://graph.facebook.com/v19.0/search?type=adinterest&q=${encodeURIComponent(options.query)}&limit=${options.limit}&access_token=${token}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Meta Graph API HTTP ${response.status} (${response.statusText}): ${errText}`);
    }

    const data = await response.json();
    const items = data.data || [];

    if (options.raw) {
      console.log(JSON.stringify(items, null, 2));
      return;
    }

    if (items.length === 0) {
      console.log(`No verified targetable Meta interests found matching "${options.query}".`);
      return;
    }

    console.log(`Found ${items.length} verified Meta interests for "${options.query}":\n`);
    items.forEach((item) => {
      const lower = item.audience_size_lower_bound ? (item.audience_size_lower_bound / 1e6).toFixed(1) + 'M' : 'Unknown';
      const upper = item.audience_size_upper_bound ? (item.audience_size_upper_bound / 1e6).toFixed(1) + 'M' : 'Unknown';
      const pathStr = Array.isArray(item.path) ? item.path.join(' > ') : 'N/A';
      console.log(`• ${item.name} (ID: ${item.id})`);
      console.log(`  Audience Size: ${lower} - ${upper} active users`);
      console.log(`  Category Path: ${pathStr}`);
      if (item.description) console.log(`  Description:   ${item.description}`);
      console.log('');
    });
  } catch (err) {
    console.error(`Error: Meta Interest query failed: ${err.message}`);
    process.exit(1);
  }
}

main();
