/**
 * DataForSEO Keyword Search Volume & CPC CLI
 * Part of @harness/skill-marketing
 */

import process from 'node:process';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    keywords: [],
    location: 'United States',
    language: 'English',
    raw: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--raw') options.raw = true;
    else if ((arg === '--keywords' || arg === '-k') && args[i + 1]) {
      options.keywords = args[++i].split(',').map((k) => k.trim()).filter(Boolean);
    } else if ((arg === '--location' || arg === '-l') && args[i + 1]) {
      options.location = args[++i];
    } else if ((arg === '--language' || arg === '-lang') && args[i + 1]) {
      options.language = args[++i];
    } else if (!arg.startsWith('-')) {
      options.keywords.push(arg);
    }
  }
  return options;
}

function printHelp() {
  console.log(`
DataForSEO Keyword Search Volume & CPC CLI
Usage:
  node search-volume.mjs --keywords "crm software, email marketing" [options]

Options:
  --keywords, -k  Comma-separated list of keywords (required)
  --location, -l  Location name (e.g. "United States", "India", "United Kingdom") [default: "United States"]
  --language      Language name [default: "English"]
  --raw           Output raw JSON
  --help, -h      Show this help

Environment Variables:
  DATAFORSEO_LOGIN      DataForSEO account login/email
  DATAFORSEO_PASSWORD   DataForSEO account API password
`);
}

async function main() {
  const options = parseArgs();

  if (options.help || options.keywords.length === 0) {
    printHelp();
    if (options.keywords.length === 0 && !options.help) {
      console.error('Error: At least one keyword is required.');
      process.exit(1);
    }
    return;
  }

  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;

  if (!login || !password) {
    const errMessage = 'DATAFORSEO_LOGIN or DATAFORSEO_PASSWORD is not set in environment. Live search volume data cannot be retrieved.';
    if (options.raw) {
      console.error(JSON.stringify({ error: 'MISSING_CREDENTIALS', message: errMessage }));
    } else {
      console.error(`Error: ${errMessage}`);
    }
    process.exit(1);
  }

  try {
    const postBody = [
      {
        keywords: options.keywords,
        location_name: options.location,
        language_name: options.language,
      },
    ];

    const authHeader = 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
    const endpoint = 'https://api.dataforseo.com/v3/keywords_data/google/search_volume/live';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(postBody),
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`DataForSEO HTTP ${response.status} (${response.statusText}): ${errText}`);
    }

    const data = await response.json();

    if (options.raw) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    const tasks = data.tasks || [];
    if (tasks.length === 0 || !tasks[0].result) {
      console.log('No results returned from DataForSEO.');
      return;
    }

    const items = tasks[0].result;
    console.log(`DataForSEO Live Search Volume (${options.location}):\n`);
    items.forEach((item) => {
      const kw = item.keyword;
      const vol = item.search_volume !== null ? item.search_volume.toLocaleString() : '0';
      const cpc = item.cpc !== null ? `$${item.cpc.toFixed(2)}` : 'N/A';
      const comp = item.competition_level || 'N/A';
      console.log(`• "${kw}"`);
      console.log(`  Search Volume:      ${vol} / mo`);
      console.log(`  Average CPC:        ${cpc}`);
      console.log(`  Competition Level:  ${comp}`);
      if (Array.isArray(item.monthly_searches) && item.monthly_searches.length > 0) {
        const recent = item.monthly_searches.slice(-3).map((m) => `${m.year}-${m.month}: ${m.search_volume}`).join(' | ');
        console.log(`  Recent Trend:       ${recent}`);
      }
      console.log('');
    });
  } catch (err) {
    console.error(`Error: DataForSEO query failed: ${err.message}`);
    process.exit(1);
  }
}

main();
