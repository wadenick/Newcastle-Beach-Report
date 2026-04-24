const cardsEl = document.getElementById('cards');
const statsEl = document.getElementById('stats');
const generatedAtEl = document.getElementById('generatedAt');
const sourceLinkEl = document.getElementById('sourceLink');
const mapStripEl = document.getElementById('mapStrip');
const bestBeachEl = document.getElementById('bestBeach');
const template = document.getElementById('card-template');
const filters = [...document.querySelectorAll('.filter')];

let currentFilter = 'all';
let payload;

const beachVisuals = {
  'stockton-beach': { gradient: 'gradient-stockton', position: 8, short: 'STO' },
  'nobbys-beach': { gradient: 'gradient-nobbys', position: 22, short: 'NOB' },
  'newcastle-beach': { gradient: 'gradient-newcastle', position: 42, short: 'NEW' },
  'bar-beach': { gradient: 'gradient-bar', position: 64, short: 'BAR' },
  'dixon-park-beach': { gradient: 'gradient-dixon', position: 74, short: 'DIX' },
  'merewether-beach': { gradient: 'gradient-merewether', position: 83, short: 'MER' }
};

const beachCamLinks = {
  'nobbys-beach': 'https://www.surfline.com/surf-report/nobbys-beach/584204204e65fad6a7709393',
  'newcastle-beach': 'https://www.surfline.com/surf-report/newcastle-beach/584204204e65fad6a770939e',
  'bar-beach': 'https://www.surfline.com/surf-report/bar-beach/584204204e65fad6a770939f',
  'dixon-park-beach': 'https://www.surfline.com/surf-report/dixon-park/584204204e65fad6a77093a3',
  'merewether-beach': 'https://www.surfline.com/surf-report/merewether/584204204e65fad6a77093a2',
  'stockton-beach': ''
};

function camProviderLabel(url) {
  if (!url) return null;
  if (url.includes('surfline.com')) return 'Surfline';
  if (url.includes('swellnet.com')) return 'Swellnet';
  return 'Provider';
}

function scoreLabel(score) {
  if (score == null) return 'Unknown';
  if (score <= 2) return 'Poor';
  if (score <= 4) return 'Fair';
  if (score <= 6) return 'Good';
  return 'Excellent';
}

function scoreClass(score) {
  if (score == null) return 'score-neutral';
  if (score <= 2) return 'score-poor';
  if (score <= 4) return 'score-fair';
  if (score <= 6) return 'score-good';
  return 'score-excellent';
}

function statusText(beach) {
  if (beach.isClosedForSwimming) return 'Closed';

  const swim = beach.swimmingScore ?? 0;
  const surf = beach.surfingScore ?? 0;

  if (swim >= 5 && surf >= 4) return 'Strong option';

  return 'Open';
}

function statusStripForBeach(beach) {
  if (beach.isClosedForSwimming) {
    return { className: 'card-status card-status-closed', text: '⚠️ CLOSED FOR SWIMMING' };
  }
  if ((beach.swimmingScore ?? 0) >= 5) {
    return { className: 'card-status card-status-strong', text: '✓ STRONG OPTION' };
  }
  return { className: 'card-status card-status-open', text: '○ OPEN' };
}

function minutesSinceUpdate(lastUpdatedText) {
  if (!lastUpdatedText) return null;
  const match = lastUpdatedText.match(/(\d+)\s*(min|mins|minutes|hour|hours)\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return match[2].toLowerCase().startsWith('hour') ? value * 60 : value;
}

function formatTemp(value) {
  if (!Number.isFinite(value)) return '—';
  return `${Math.round(value)}°C`;
}

function bestBeach(beaches) {
  return [...beaches].sort((a, b) => {
    if (a.isClosedForSwimming !== b.isClosedForSwimming) return a.isClosedForSwimming ? 1 : -1;
    return (b.swimmingScore ?? -1) - (a.swimmingScore ?? -1) || (b.surfingScore ?? -1) - (a.surfingScore ?? -1);
  })[0];
}

function renderStats(beaches) {
  const closed = beaches.filter((b) => b.isClosedForSwimming).length;
  const open = beaches.length - closed;
  const strong = beaches.filter((b) => !b.isClosedForSwimming && (b.swimmingScore ?? 0) >= 5).length;
  statsEl.innerHTML = `
    <div class="stat stat-danger"><span>Swimming closed</span><strong>${closed}</strong></div>
    <div class="stat stat-good"><span>Strong options</span><strong>${strong}</strong></div>
  `;
}

function filteredBeaches(beaches) {
  if (currentFilter === 'closed') return beaches.filter((b) => b.isClosedForSwimming);
  if (currentFilter === 'best') {
    return [...beaches]
      .filter((b) => !b.isClosedForSwimming)
      .sort((a, b) => (b.swimmingScore ?? -1) - (a.swimmingScore ?? -1) || (b.surfingScore ?? -1) - (a.surfingScore ?? -1));
  }
  return beaches;
}

function renderMap(beaches) {
  mapStripEl.innerHTML = '';
  const track = document.createElement('div');
  track.className = 'map-track';
  track.innerHTML = `
    <div class="map-water"></div>
    <div class="map-coast"></div>
    <div class="map-label north">North</div>
    <div class="map-label south">South</div>
  `;

  beaches.forEach((beach) => {
    const visual = beachVisuals[beach.slug] || { gradient: 'gradient-newcastle', position: 50, short: beach.name.slice(0, 3).toUpperCase() };
    const pin = document.createElement('a');
    pin.href = beach.url;
    pin.target = '_blank';
    pin.rel = 'noreferrer';
    pin.className = `map-pin ${beach.isClosedForSwimming ? 'map-pin-closed' : 'map-pin-open'}`;
    pin.style.left = `${visual.position}%`;
    pin.innerHTML = `
      <span class="map-dot"></span>
      <span class="map-mini ${visual.gradient}">${visual.short}</span>
    `;
    track.appendChild(pin);
  });

  mapStripEl.appendChild(track);
}

function renderBestBeach(beaches) {
  const best = bestBeach(beaches);
  if (!best) return;
  const strip = statusStripForBeach(best);
  bestBeachEl.innerHTML = `
    <div class="best-card">
      <div class="${strip.className}">${strip.text}</div>
      <div class="best-card-body">
        <div class="best-kicker">${best.name}</div>
        <div class="best-metrics">
          <span class="score-pill ${scoreClass(best.swimmingScore)}">Swim ${best.swimmingScore ?? '—'}/10 · ${scoreLabel(best.swimmingScore)}</span>
          <span class="score-pill ${scoreClass(best.surfingScore)}">Surf ${best.surfingScore ?? '—'}/10 · ${scoreLabel(best.surfingScore)}</span>
        </div>
        <p class="best-copy">${best.isClosedForSwimming ? 'Currently flagged closed on the child page.' : 'Best open all-round option in the current feed.'}</p>
        <a class="best-link" href="${best.url}" target="_blank" rel="noreferrer">View beach report ↗</a>
      </div>
    </div>
  `;
}

function renderCards(beaches) {
  cardsEl.innerHTML = '';
  for (const beach of filteredBeaches(beaches)) {
    const node = template.content.firstElementChild.cloneNode(true);
    const reportLinkEl = node.querySelector('.card-report-link');
    const camLinkEl = node.querySelector('.card-cam-link');

    reportLinkEl.href = beach.url;
    node.querySelector('.card-title').textContent = beach.name;
    const updatedEl = node.querySelector('.card-updated');
    updatedEl.textContent = beach.lastUpdatedText ? `Updated ${beach.lastUpdatedText}` : 'Update time unavailable';
    const ageMinutes = minutesSinceUpdate(beach.lastUpdatedText);
    if (ageMinutes != null && ageMinutes >= 300) {
      const staleIndicator = document.createElement('span');
      staleIndicator.className = 'stale-indicator';
      staleIndicator.textContent = 'Old data!';
      staleIndicator.dataset.tooltip = "This report hasn't been updated by City staff in quite a while ¯\\_(ツ)_/¯";
      staleIndicator.tabIndex = 0;
      updatedEl.append(' ');
      updatedEl.appendChild(staleIndicator);
    }

    const statusEl = node.querySelector('.card-status');
    const strip = statusStripForBeach(beach);
    statusEl.className = strip.className;
    statusEl.textContent = strip.text;

    node.querySelector('.swim-value').textContent = beach.swimmingScore ?? '—';
    node.querySelector('.surf-value').textContent = beach.surfingScore ?? '—';
    node.querySelector('.crowd-value').textContent = beach.crowdLevel ?? 'Unknown';
    node.querySelector('.air-temp-value').textContent = formatTemp(beach.airTemperatureC);
    node.querySelector('.water-temp-value').textContent = formatTemp(beach.waterTemperatureC);
    const camUrl = beachCamLinks[beach.slug];
    if (camUrl) {
      camLinkEl.href = camUrl;
      camLinkEl.textContent = `Live cam (${camProviderLabel(camUrl)})`;
    } else {
      camLinkEl.removeAttribute('href');
      camLinkEl.removeAttribute('target');
      camLinkEl.removeAttribute('rel');
      camLinkEl.textContent = 'Live cam unavailable';
      camLinkEl.classList.add('card-link-disabled');
    }

    cardsEl.appendChild(node);
  }

  if (!cardsEl.children.length) {
    cardsEl.innerHTML = '<div class="empty-state">No beaches match this filter right now.</div>';
  }
}

async function load() {
  const basePath = window.location.pathname.includes('/Newcastle-Beach-Report/') 
    ? '/Newcastle-Beach-Report' 
    : '';
  const res = await fetch(`${basePath}/data/beaches.json`, { cache: 'no-store' });
  payload = await res.json();
  renderStats(payload.beaches);
  renderMap(payload.beaches);
  renderBestBeach(payload.beaches);
  renderCards(payload.beaches);
  generatedAtEl.textContent = new Date(payload.generatedAt).toLocaleString('en-AU', {
    dateStyle: 'full',
    timeStyle: 'short'
  });
  sourceLinkEl.href = payload.source || 'https://newcastle.nsw.gov.au/explore/beaches';
}

filters.forEach((button) => {
  button.addEventListener('click', () => {
    filters.forEach((b) => b.classList.remove('is-active'));
    button.classList.add('is-active');
    currentFilter = button.dataset.filter;
    renderCards(payload.beaches);
  });
});

load().catch((error) => {
  generatedAtEl.textContent = 'Failed to load latest report.';
  console.error(error);
});
