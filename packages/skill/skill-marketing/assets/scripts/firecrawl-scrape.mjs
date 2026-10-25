/**
 * Firecrawl Web Page & Landing Page Scraper CLI
 * Part of @harness/skill-marketing
 */

import process from 'node:process';
import { writeFile } from 'node:fs/promises';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    url: '',
    formats: ['markdown'],
    raw: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--raw') options.raw = true;
    else if ((arg === '--url' || arg === '-u') && args[i + 1]) options.url = args[++i];
    else if (!options.url && !arg.startsWith('-')) options.url = arg;
  }
  return options;
}

function printHelp() {
  console.log(`
Firecrawl Web Page Scraper CLI
Usage:
  node firecrawl-scrape.mjs --url <website_url> [options]

Options:
  --url, -u     Full website or landing page URL (required)
  --raw         Output raw JSON
  --help, -h    Show this help

Environment Variables:
  FIRECRAWL_API_KEY   Firecrawl API Key
`);
}

async function main() {
  const options = parseArgs();

  if (options.help || !options.url) {
    printHelp();
    if (!options.url && !options.help) {
      console.error('Error: --url is required.');
      process.exit(1);
    }
    return;
  }

  const apiKey = process.env.FIRECRAWL_API_KEY;

  if (!apiKey) {
    const errMessage = 'FIRECRAWL_API_KEY environment variable is not configured. Webpage scraping cannot proceed.';
    if (options.raw) {
      console.error(JSON.stringify({ error: 'MISSING_API_KEY', message: errMessage }));
    } else {
      console.error(`Error: ${errMessage}`);
    }
    process.exit(1);
  }

  try {
    console.log(`Scraping landing page: ${options.url}...`);
    const endpoint = 'https://api.firecrawl.dev/v1/scrape';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url: options.url,
        formats: options.formats,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Firecrawl HTTP ${response.status} (${response.statusText}): ${errText}`);
    }

    const result = await response.json();

    if (options.raw) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const markdown = result?.data?.markdown || result?.markdown || '';

    if (!markdown) {
      console.log('No content extracted from page.');
      return;
    }

    console.log(`Successfully scraped ${options.url} (${markdown.length} chars):\n`);
    console.log(markdown);
  } catch (err) {
    console.error(`Error: Firecrawl scraping failed: ${err.message}`);
    process.exit(1);
  }
}

main();
