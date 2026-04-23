import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://newcastle.nsw.gov.au';
const INDEX_URL = `${BASE_URL}/explore/beaches`;
const OUTPUT_DIR = path.resolve('site/data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'beaches.json');

const BEACHES = [
  { slug: 'nobbys-beach', name: 'Nobbys Beach', url: `${BASE_URL}/explore/beaches/nobbys-beach` },
  { slug: 'newcastle-beach', name: 'Newcastle Beach', url: `${BASE_URL}/explore/beaches/newcastle-beach` },
  { slug: 'bar-beach', name: 'Bar Beach', url: `${BASE_URL}/explore/beaches/bar-beach` },
  { slug: 'dixon-park-beach', name: 'Dixon Park Beach', url: `${BASE_URL}/explore/beaches/dixon-park-beach` },
  { slug: 'merewether-beach', name: 'Merewether Beach', url: `${BASE_URL}/explore/beaches/merewether-beach` },
  { slug: 'stockton-beach', name: 'Stockton Beach', url: `${BASE_URL}/explore/beaches/stockton-beach` }
];

function clean(text = '') {
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Nick-Newcastle-Beach-Report/1.0',
      'accept-language': 'en-AU,en;q=0.9'
    }
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

function extractIndexSummary(indexText, beachName) {
  const idx = indexText.indexOf(beachName);
  if (idx === -1) return {};
  const slice = indexText.slice(idx, idx + 500);
  return {
    swimmingScore: numberMatch(slice, /(\d+)\s*\/10\s*Swimming/i),
    surfingScore: numberMatch(slice, /(\d+)\s*\/10\s*Surfing/i),
    crowdLevel: textMatch(slice, /\b(Uncrowded|Moderately busy|Crowded|Temporarily Unavailable)\b/i),
    summaryStatus: textMatch(slice, /\b(Open|Closed|Temporarily Unavailable)\b/i),
    lastUpdatedText: textMatch(slice, /Last Updated Info:\s*(.+?)(?=(\d+\s*\/10)|$)/i)
  };
}

function numberMatch(text, regex) {
  const match = text.match(regex);
  return match ? Number(match[1]) : null;
}

function textMatch(text, regex) {
  const match = text.match(regex);
  return match ? clean(match[1]) : null;
}

function parseChildPage(html, beach) {
  const $ = cheerio.load(html);
  const body = clean($('body').text());

  let warning = textMatch(
    body,
    /Warning:\s*(.+?)(?=(\d+\s+hours?\s+ago)|(\d+\s+min\s+ago)|Swimming safety|Information Last updated|Lifeguards on duty|$)/i
  );

  if (warning) {
    warning = warning
      .replace(/\u00A0/g, ' ')
      .replace(/View\s+beach\s+on\s+map[^\w]*?/gi, '')
      .replace(/\s+/g, ' ')
      .replace(/\s+([.,!])/g, '$1')
      .trim();
  }

  const swimmingScore = numberMatch(body, /Swimming safety.*?(\d+)\s*\/10/i);
  const surfingScore = numberMatch(body, /Surf quality\s+(\d+)\s*\/10/i);
  const crowdLevel = textMatch(
    body,
    /Crowds\s+(Uncrowded|Moderately busy|Crowded|Temporarily Unavailable)/i
  );

  const lastUpdatedText =
    textMatch(
      body,
      /Information Last updated\s+(\d+\s+(?:min|mins|minutes|hour|hours)\s+ago(?:\s*·\s*\d{1,2}(?::\d{2})?\s*(?:am|pm))?)/i
    ) ||
    textMatch(
      body,
      /(\d+\s+(?:min|mins|minutes|hour|hours)\s+ago(?:\s*·\s*\d{1,2}(?::\d{2})?\s*(?:am|pm))?)/i
    );

  const isClosedForSwimming =
    !!warning &&
    (/closed due to weather conditions/i.test(warning) || /^Other$/i.test(warning));

  return {
    slug: beach.slug,
    name: beach.name,
    url: beach.url,
    swimmingScore,
    surfingScore,
    crowdLevel,
    summaryStatus: isClosedForSwimming ? 'Closed' : 'Open',
    childWarning: warning ? `Warning: ${warning}` : null,
    isClosedForSwimming,
    lastUpdatedText
  };
}

async function run() {
  const indexHtml = await fetchHtml(INDEX_URL);
  const indexText = clean(cheerio.load(indexHtml)('body').text());

  const beaches = await Promise.all(
    BEACHES.map(async (beach) => {
      const summary = extractIndexSummary(indexText, beach.name);
      const childHtml = await fetchHtml(beach.url);
      const child = parseChildPage(childHtml, beach);

      const isClosed = child.isClosedForSwimming;
      return {
        slug: beach.slug,
        name: beach.name,
        url: beach.url,
        swimmingScore: child.swimmingScore ?? summary.swimmingScore ?? null,
        surfingScore: child.surfingScore ?? summary.surfingScore ?? null,
        crowdLevel: child.crowdLevel ?? summary.crowdLevel ?? null,
        summaryStatus: isClosed ? 'Closed' : (summary.summaryStatus ?? child.summaryStatus ?? 'Open'),
        childWarning: child.childWarning ?? null,
        isClosedForSwimming: isClosed,
        lastUpdatedText: child.lastUpdatedText ?? summary.lastUpdatedText ?? null
      };
    })
  );

  beaches.sort((a, b) => {
    if (a.isClosedForSwimming !== b.isClosedForSwimming) {
      return a.isClosedForSwimming ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    source: INDEX_URL,
    beaches
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${OUTPUT_FILE}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
