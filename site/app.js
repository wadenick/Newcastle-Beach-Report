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
  'stockton-beach': { gradient: 'gradient-stockton', position: 8, short: 'STO' }
  'nobbys-beach': { gradient: 'gradient-nobbys', position: 28, short: 'NOB' },
  'newcastle-beach': { gradient: 'gradient-newcastle', position: 42, short: 'NEW' },
  'bar-beach': { gradient: 'gradient-bar', position: 64, short: 'BAR' },
  'dixon-park-beach': { gradient: 'gradient-dixon', position: 74, short: 'DIX' },
  'merewether-beach': { gradient: 'gradient-merewether', position: 83, short: 'MER' },
};

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
  if ((beach.swimmingScore ?? 0) >= 5) return 'Strong option';
  return 'Open';
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
    <div class="stat"><span>Beaches tracked</span><strong>${beaches.length}</strong></div>
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
    <div class="map-harbor"></div>
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
  bestBeachEl.innerHTML = `
    <div class="best-card ${best.isClosedForSwimming ? 'best-card-closed' : ''}">
      <div class="best-kicker">${best.name}</div>
      <div class="best-metrics">
        <span class="score-pill ${scoreClass(best.swimmingScore)}">Swim ${best.swimmingScore ?? '—'}/10 · ${scoreLabel(best.swimmingScore)}</span>
        <span class="score-pill ${scoreClass(best.surfingScore)}">Surf ${best.surfingScore ?? '—'}/10 · ${scoreLabel(best.surfingScore)}</span>
      </div>
      <p class="best-copy">${best.isClosedForSwimming ? 'Currently flagged closed on the child page.' : 'Best open all-round option in the current feed.'}</p>
      <a class="best-link" href="${best.url}" target="_blank" rel="noreferrer">Open source page →</a>
    </div>
  `;
}

function renderCards(beaches) {
  cardsEl.innerHTML = '';
  for (const beach of filteredBeaches(beaches)) {
    const node = template.content.firstElementChild.cloneNode(true);
    const visual = beachVisuals[beach.slug] || { gradient: 'gradient-newcastle', short: beach.name.slice(0, 3).toUpperCase() };

    node.href = beach.url;
    node.querySelector('.card-thumb').classList.add(visual.gradient);
    node.querySelector('.thumb-name').textContent = visual.short;
    node.querySelector('.card-title').textContent = beach.name;
    node.querySelector('.card-updated').textContent = beach.lastUpdatedText ? `Updated ${beach.lastUpdatedText}` : 'Update time unavailable';

    const status = node.querySelector('.status-pill');
    status.textContent = statusText(beach);
    status.className = `status-pill ${beach.isClosedForSwimming ? 'status-closed' : ((beach.swimmingScore ?? 0) >= 5 ? 'status-strong' : 'status-open')}`;

    const warning = node.querySelector('.warning');
    if (beach.childWarning) {
      warning.textContent = beach.childWarning;
      warning.classList.remove('hidden');
    }

    node.querySelector('.swim-value').textContent = beach.swimmingScore ?? '—';
    node.querySelector('.surf-value').textContent = beach.surfingScore ?? '—';
    node.querySelector('.crowd-value').textContent = beach.crowdLevel ?? 'Unknown';

    const swimPill = node.querySelector('.swim-pill');
    swimPill.textContent = scoreLabel(beach.swimmingScore);
    swimPill.classList.add(scoreClass(beach.swimmingScore));

    const surfPill = node.querySelector('.surf-pill');
    surfPill.textContent = scoreLabel(beach.surfingScore);
    surfPill.classList.add(scoreClass(beach.surfingScore));

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
  sourceLinkEl.textContent = 'Open source';
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
