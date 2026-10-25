/**
 * Meta Ad Library Scraper CLI (Apify Facebook Ad Library Actor)
 * Part of @harness/skill-marketing
 */

import process from 'node:process';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    query: '',
    country: 'ALL',
    limit: 10,
    media: 'all',
    status: 'ACTIVE',
    raw: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--raw') options.raw = true;
    else if ((arg === '--query' || arg === '-q') && args[i + 1]) options.query = args[++i];
    else if ((arg === '--country' || arg === '-c') && args[i + 1]) options.country = args[++i];
    else if ((arg === '--limit' || arg === '-l') && args[i + 1]) options.limit = parseInt(args[++i], 10) || 10;
    else if ((arg === '--media' || arg === '-m') && args[i + 1]) options.media = args[++i];
    else if ((arg === '--status' || arg === '-s') && args[i + 1]) options.status = args[++i];
    else if (!options.query && !arg.startsWith('-')) options.query = arg;
  }
  return options;
}

function printHelp() {
  console.log(`
Meta Ad Library Scraper
Usage:
  node meta-ads.mjs --query <brand_or_keyword> [options]

Options:
  --query, -q    Search term, brand name, or competitor domain (required)
  --country, -c  Country code (e.g. US, IN, GB, ALL) [default: ALL]
  --limit, -l    Maximum number of ads to return [default: 10]
  --media, -m    Media type (all, image, video) [default: all]
  --status, -s   Ad status (ACTIVE, ALL) [default: ACTIVE]
  --raw          Output raw JSON instead of human-readable summary
  --help, -h     Show this help

Environment Variables:
  APIFY_API_TOKEN   Apify API token for fetching real-time Meta Ad Library data
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

  const apiKey = process.env.APIFY_API_TOKEN;

  if (!apiKey) {
    const errMessage = 'APIFY_API_TOKEN environment variable is not configured. Live Meta Ad Library data cannot be retrieved.';
    if (options.raw) {
      console.error(JSON.stringify({ error: 'MISSING_API_TOKEN', message: errMessage }));
    } else {
      console.error(`Error: ${errMessage}`);
    }
    process.exit(1);
  }

  console.log(`Searching Meta Ad Library for "${options.query}" (Country: ${options.country}, Limit: ${options.limit})...`);

  try {
    const endpoint = `https://api.apify.com/v2/acts/apify~facebook-ad-library-scraper/run-sync-get-dataset-items?token=${apiKey}`;
    
    const requestPayload = {
      searchTerms: [options.query],
      countryCode: options.country,
      maxAds: options.limit,
      adActiveStatus: options.status,
    };

    if (options.media !== 'all') {
      requestPayload.mediaType = options.media.toUpperCase();
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload),
      signal: AbortSignal.timeout(45000),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Apify API HTTP ${response.status} (${response.statusText}): ${errText}`);
    }

    const items = await response.json();

    if (options.raw) {
      console.log(JSON.stringify(items, null, 2));
      return;
    }

    if (!Array.isArray(items) || items.length === 0) {
      console.log(`No active ads found in Meta Ad Library for query "${options.query}".`);
      return;
    }

    console.log(`Extracted ${items.length} verified live ads for "${options.query}":\n`);
    items.forEach((item, idx) => {
      const pageName = item.pageName || item.page_name || options.query;
      const text = item.adCreativeBody || item.adText || item.caption || item.snapshot?.body?.text || 'N/A';
      const headline = item.adCreativeTitle || item.title || item.snapshot?.title || 'N/A';
      const cta = item.adCreativeLinkCaption || item.cta_text || item.snapshot?.cta_text || 'N/A';
      const startDate = item.startDate || item.ad_delivery_start_time || 'N/A';
      const formats = item.mediaType || (item.snapshot?.videos?.length ? 'Video' : 'Image');

      console.log(`--- [Ad #${idx + 1}] Page: ${pageName} (${formats}) ---`);
      if (startDate !== 'N/A') console.log(`Started:  ${startDate}`);
      if (headline !== 'N/A') console.log(`Headline: ${headline}`);
      console.log(`Copy:     ${text.slice(0, 300)}${text.length > 300 ? '...' : ''}`);
      if (cta !== 'N/A') console.log(`CTA:      ${cta}`);
      console.log('');
    });
  } catch (err) {
    console.error(`Error: Meta Ad Library search failed: ${err.message}`);
    process.exit(1);
  }
}

main();
