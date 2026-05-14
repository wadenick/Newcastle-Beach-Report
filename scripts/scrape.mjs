import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://newcastle.nsw.gov.au';
const INDEX_URL = `${BASE_URL}/explore/beaches`;
const OUTPUT_DIR = path.resolve('site/data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'beaches.json');
const OPEN_METEO_WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';

const BEACHES = [
  { slug: 'nobbys-beach', name: 'Nobbys Beach', url: `${BASE_URL}/explore/beaches/nobbys-beach`, lat: -32.9267, lon: 151.7819 },
  { slug: 'newcastle-beach', name: 'Newcastle Beach', url: `${BASE_URL}/explore/beaches/newcastle-beach`, lat: -32.9316, lon: 151.7838 },
  { slug: 'bar-beach', name: 'Bar Beach', url: `${BASE_URL}/explore/beaches/bar-beach`, lat: -32.9398, lon: 151.7619 },
  { slug: 'dixon-park-beach', name: 'Dixon Park Beach', url: `${BASE_URL}/explore/beaches/dixon-park-beach`, lat: -32.9455, lon: 151.759 },
  { slug: 'merewether-beach', name: 'Merewether Beach', url: `${BASE_URL}/explore/beaches/merewether-beach`, lat: -32.9489, lon: 151.758 },
  { slug: 'stockton-beach', name: 'Stockton Beach', url: `${BASE_URL}/explore/beaches/stockton-beach`, lat: -32.9095, lon: 151.7888 }
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

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Nick-Newcastle-Beach-Report/1.0',
      'accept-language': 'en-AU,en;q=0.9'
    }
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

function firstFiniteNumber(values) {
  if (!Array.isArray(values)) return null;
  const value = values.find((entry) => Number.isFinite(entry));
  return Number.isFinite(value) ? value : null;
}

function pickCurrentOrHourly(currentValue, hourlyValues) {
  if (Number.isFinite(currentValue)) return currentValue;
  return firstFiniteNumber(hourlyValues);
}

async function fetchBeachTemperatures(beach) {
  const weatherUrl =
    `${OPEN_METEO_WEATHER_URL}?latitude=${beach.lat}&longitude=${beach.lon}` +
    '&current=temperature_2m&hourly=temperature_2m&forecast_days=1&timezone=Australia%2FSydney';
  const marineUrl =
    `${OPEN_METEO_MARINE_URL}?latitude=${beach.lat}&longitude=${beach.lon}` +
    '&current=sea_surface_temperature&hourly=sea_surface_temperature&forecast_days=1&timezone=Australia%2FSydney';

  try {
    const [weather, marine] = await Promise.all([fetchJson(weatherUrl), fetchJson(marineUrl)]);
    return {
      airTemperatureC: pickCurrentOrHourly(weather?.current?.temperature_2m, weather?.hourly?.temperature_2m),
      waterTemperatureC: pickCurrentOrHourly(marine?.current?.sea_surface_temperature, marine?.hourly?.sea_surface_temperature),
      temperatureSource: 'Open-Meteo'
    };
  } catch (error) {
    console.warn(`Temperature lookup failed for ${beach.slug}: ${error.message}`);
    return {
      airTemperatureC: null,
      waterTemperatureC: null,
      temperatureSource: 'Open-Meteo'
    };
  }
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
    lastUpdatedText: extractIndexLastUpdatedText(slice)
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

const RELATIVE_UPDATE_RE = /^(\d+)\s+(min|mins|minutes|hour|hours|day|days)\s+ago(?:\s*(?:·|-)?\s*\d{1,2}(?:(?::|\.)\d{2})?\s*(?:am|pm)?(?:\s*-\s*\d{1,2}\s+\w+\s+\d{4})?)?$/i;
const RELATIVE_UPDATE_SCAN_RE = /\b\d+\s+(?:min|mins|minutes|hour|hours|day|days)\s+ago(?:\s*(?:·|-)?\s*\d{1,2}(?:(?::|\.)\d{2})?\s*(?:am|pm)?(?:\s*-\s*\d{1,2}\s+\w+\s+\d{4})?)?/i;

function normalizeLastUpdatedText(value) {
  if (!value) return null;
  const cleaned = clean(value);
  if (!cleaned) return null;

  const match = cleaned.match(RELATIVE_UPDATE_RE);
  if (!match) return null;

  return cleaned.replace(/^1\s+days\b/i, '1 day');
}

function extractLastUpdatedText(text) {
  const labelled = textMatch(
    text,
    /(?:Information\s+)?Last updated(?:\s+Info:)?\s+(.+?)(?=(?:\d+\s*\/10\b)|Swimming safety|Swimming\s+--|Surf quality|Surfing\b|Crowds\b|Temporarily Unavailable|Open\b|Closed\b|Under review|Final outcome|Beach Safety Guides|Lifeguards on duty|Facilities|$)/i
  );

  return normalizeLastUpdatedText(labelled) || normalizeLastUpdatedText(textMatch(text, RELATIVE_UPDATE_SCAN_RE));
}

function extractIndexLastUpdatedText(slice) {
  const labelled = textMatch(
    slice,
    /Last Updated Info:\s*(.+?)(?=(?:\d+\s*\/10\b)|Swimming\s+--|Surfing\b|Temporarily Unavailable|Open\b|Closed\b|Under review|Final outcome|Beach Safety Guides|$)/i
  );

  return normalizeLastUpdatedText(labelled) || normalizeLastUpdatedText(textMatch(slice, RELATIVE_UPDATE_SCAN_RE));
}

function formatSeasonalReturnDate(day, month, year) {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIndex = Number(month) - 1;
  const monthName = monthNames[monthIndex] ?? month;
  return `${Number(day)} ${monthName} ${year}`;
}

function extractSeasonalClosure(body) {
  if (!/Closed for the Winter Period/i.test(body)) return null;

  const returnMatch = body.match(/Lifeguards will return to this location on\s+(\d{1,2})\.(\d{1,2})\.(\d{4})/i);
  const seasonalReturnText = returnMatch
    ? formatSeasonalReturnDate(returnMatch[1], returnMatch[2], returnMatch[3])
    : null;

  return {
    seasonalClosureText: seasonalReturnText
      ? `Closed for winter. Lifeguards return ${seasonalReturnText}.`
      : 'Closed for winter.',
    seasonalReturnText
  };
}

function parseChildPage(html, beach) {
  const $ = cheerio.load(html);
  const body = clean($('body').text());

  function cleanExtractedText(value) {
    if (!value) return null;

    const cleaned = value
      .replace(/\u00A0/g, ' ')
      .replace(/View\s+beach\s+on\s+map[^\w]*?/gi, '')
      .replace(/\s+/g, ' ')
      .replace(/\s+([.,!])/g, '$1')
      .trim();

    return cleaned || null;
  }

  function getChildWarning($, body) {
    // First try to detect an actual warning block in the DOM.
    // This is more reliable than only parsing the flattened body text.
    const warningStrong = $('strong')
      .filter((_, el) => clean($(el).text()).toLowerCase() === 'warning:')
      .first();

    if (warningStrong.length) {
      // Try the next sibling first, which matches markup like:
      // <strong>Warning:</strong><span>Other</span>
      let warningText = cleanExtractedText(warningStrong.next().text());

      // Fallback: grab the parent text and strip the "Warning:" label
      if (!warningText) {
        const parentText = cleanExtractedText(warningStrong.parent().text());
        if (parentText) {
          warningText = cleanExtractedText(
            parentText.replace(/^Warning:\s*/i, '')
          );
        }
      }

      // Final fallback: use just "Warning" presence even if the trailing text is empty
      return warningText || 'Warning present';
    }

    // Text-based fallback if DOM structure changes
    const textWarning = textMatch(
      body,
      /Warning:\s*(.+?)(?=(\d+\s+hours?\s+ago)|(\d+\s+min(?:s|utes)?\s+ago)|Swimming safety|Information Last updated|Lifeguards on duty|Facilities|$)/i
    );

    return cleanExtractedText(textWarning);
  }

  function hasClosureWarning(warning) {
    // Your new rule: any warning on the child page means closed for swimming
    return !!warning;
  }

  const warning = getChildWarning($, body);

  const swimmingScore = numberMatch(body, /Swimming safety.*?(\d+)\s*\/10/i);
  const surfingScore = numberMatch(body, /Surf quality\s+(\d+)\s*\/10/i);
  const crowdLevel = textMatch(
    body,
    /Crowds\s+(Uncrowded|Moderately busy|Crowded|Temporarily Unavailable)/i
  );

  const lastUpdatedText = extractLastUpdatedText(body);
  const seasonalClosure = extractSeasonalClosure(body);

  const isClosedForSwimming = hasClosureWarning(warning) || !!seasonalClosure;

  return {
    slug: beach.slug,
    name: beach.name,
    url: beach.url,
    swimmingScore,
    surfingScore,
    crowdLevel,
    summaryStatus: seasonalClosure ? 'Closed for winter' : (isClosedForSwimming ? 'Closed' : 'Open'),
    childWarning: warning ? `Warning: ${warning}` : null,
    isClosedForSwimming,
    isSeasonalClosure: !!seasonalClosure,
    seasonalClosureText: seasonalClosure?.seasonalClosureText ?? null,
    seasonalReturnText: seasonalClosure?.seasonalReturnText ?? null,
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
      const temps = await fetchBeachTemperatures(beach);

      const isClosed = child.isClosedForSwimming;
      return {
        slug: beach.slug,
        name: beach.name,
        url: beach.url,
        swimmingScore: child.swimmingScore ?? summary.swimmingScore ?? null,
        surfingScore: child.surfingScore ?? summary.surfingScore ?? null,
        crowdLevel: child.crowdLevel ?? summary.crowdLevel ?? null,
        summaryStatus: child.isSeasonalClosure ? child.summaryStatus : (isClosed ? 'Closed' : (summary.summaryStatus ?? child.summaryStatus ?? 'Open')),
        childWarning: child.childWarning ?? null,
        isClosedForSwimming: isClosed,
        isSeasonalClosure: child.isSeasonalClosure ?? false,
        seasonalClosureText: child.seasonalClosureText ?? null,
        seasonalReturnText: child.seasonalReturnText ?? null,
        lastUpdatedText: child.lastUpdatedText ?? summary.lastUpdatedText ?? null,
        airTemperatureC: temps.airTemperatureC,
        waterTemperatureC: temps.waterTemperatureC,
        temperatureSource: temps.temperatureSource
      };
    })
  );

  beaches.sort((a, b) => {
    if (a.isClosedForSwimming !== b.isClosedForSwimming) {
      return a.isClosedForSwimming ? 1 : -1;
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
