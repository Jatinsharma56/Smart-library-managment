const API_URL = '/api/status';
const REFRESH_INTERVAL_MS = 10_000;

let latestSnapshot = null;
let autoRefreshTimer = null;
let sessionId = null;
let currentUser = null;

const totalCapacityEl = document.getElementById('totalCapacity');
const availableSeatsEl = document.getElementById('availableSeats');
const occupancyPctEl = document.getElementById('occupancyPct');
const aiForecastLabelEl = document.getElementById('aiForecastLabel');
const aiForecastMinutesEl = document.getElementById('aiForecastMinutes');
const densityFillEl = document.getElementById('densityFill');
const lastUpdatedEl = document.getElementById('lastUpdated');
const crowdLabelEl = document.getElementById('crowdLabel');
const zonesGridEl = document.getElementById('zonesGrid');
const sortSelectEl = document.getElementById('sortSelect');
const filterSelectEl = document.getElementById('filterSelect');
const autoRefreshToggleEl = document.getElementById('autoRefreshToggle');

// Auth and user actions
const authOpenButtonEl = document.getElementById('authOpenButton');
const authDialogBackdropEl = document.getElementById('authDialogBackdrop');
const authCloseButtonEl = document.getElementById('authCloseButton');
const authTabLoginEl = document.getElementById('authTabLogin');
const authTabSignupEl = document.getElementById('authTabSignup');
const authFormEl = document.getElementById('authForm');
const authNameRowEl = document.getElementById('authNameRow');
const authNameInputEl = document.getElementById('authNameInput');
const authEmailInputEl = document.getElementById('authEmailInput');
const authPasswordInputEl = document.getElementById('authPasswordInput');
const authSubmitButtonEl = document.getElementById('authSubmitButton');
const authFeedbackEl = document.getElementById('authFeedback');
const authUserInfoEl = document.getElementById('authUserInfo');
const authUserNameEl = document.getElementById('authUserName');

const seatZoneSelectEl = document.getElementById('seatZoneSelect');
const seatMapGridEl = document.getElementById('seatMapGrid');
const seatBookMessageEl = document.getElementById('seatBookMessage');

const bookSearchInputEl = document.getElementById('bookSearchInput');
const bookSearchButtonEl = document.getElementById('bookSearchButton');
const bookResultsEl = document.getElementById('bookResults');

const forecastListEl = document.getElementById('forecastList');

let authMode = 'login';
let seatMapData = null;
let selectedZoneId = seatZoneSelectEl ? seatZoneSelectEl.value : 'silent';
let appBootstrapped = false;

async function fetchStatus() {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const snapshot = await response.json();
    latestSnapshot = snapshot;
    renderSnapshot(snapshot);
  } catch (error) {
    console.error('Failed to fetch status', error);
    showErrorState();
  }
}

function showErrorState() {
  crowdLabelEl.textContent = 'Connection issue';
  crowdLabelEl.style.background =
    'radial-gradient(circle at 0 0, rgba(248,113,113,0.5), transparent), rgba(15,23,42,0.95)';
  lastUpdatedEl.textContent = 'Last updated: unable to reach server';
}

function formatTime(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function occupancyLabelFromRatio(r) {
  if (r >= 0.85) return 'very-busy';
  if (r >= 0.65) return 'busy';
  if (r >= 0.4) return 'moderate';
  return 'quiet';
}

function humanLabelFromKey(key) {
  switch (key) {
    case 'very-busy':
      return 'Very busy';
    case 'busy':
      return 'Busy';
    case 'moderate':
      return 'Moderate';
    case 'quiet':
      return 'Quiet';
    default:
      return key;
  }
}

function renderSnapshot(snapshot) {
  const { total, aiInsight, zones, generatedAt } = snapshot;

  totalCapacityEl.textContent = total.capacity.toString();
  availableSeatsEl.textContent = total.available.toString();

  const occupancyPct = Math.round(total.occupancyRatio * 100);
  occupancyPctEl.textContent = `${occupancyPct}%`;

  const densityScale = Math.max(0.05, Math.min(0.99, total.occupancyRatio));
  densityFillEl.style.transform = `scaleX(${densityScale})`;

  aiForecastLabelEl.textContent = aiInsight.forecastLabel;
  aiForecastMinutesEl.textContent = aiInsight.forecastMinutesAhead.toString();

  crowdLabelEl.textContent = total.crowdLabel;
  const labelKey = occupancyLabelFromRatio(total.occupancyRatio);
  const labelStyles = {
    quiet:
      'radial-gradient(circle at 0 0, rgba(45,212,191,0.4), transparent), rgba(15,23,42,0.95)',
    moderate:
      'radial-gradient(circle at 0 0, rgba(234,179,8,0.4), transparent), rgba(15,23,42,0.95)',
    busy:
      'radial-gradient(circle at 0 0, rgba(249,115,22,0.5), transparent), rgba(15,23,42,0.95)',
    'very-busy':
      'radial-gradient(circle at 0 0, rgba(248,113,113,0.6), transparent), rgba(15,23,42,0.95)'
  };
  crowdLabelEl.style.background = labelStyles[labelKey] || labelStyles.moderate;

  lastUpdatedEl.textContent = `Last updated: ${formatTime(generatedAt)}`;

  renderZones(zones);
  renderForecast(aiInsight);
}

function applyZoneFilterAndSort(zones) {
  const sortValue = sortSelectEl.value;
  const filterValue = filterSelectEl.value;

  let result = zones.slice();

  if (filterValue !== 'all') {
    result = result.filter((z) => {
      const labelKey = occupancyLabelFromRatio(z.occupancyRatio);
      if (filterValue === 'quiet') return labelKey === 'quiet';
      if (filterValue === 'moderate') return labelKey === 'moderate';
      if (filterValue === 'busy')
        return labelKey === 'busy' || labelKey === 'very-busy';
      return true;
    });
  }

  if (sortValue === 'occupancy-desc') {
    result.sort((a, b) => b.occupancyRatio - a.occupancyRatio);
  } else if (sortValue === 'occupancy-asc') {
    result.sort((a, b) => a.occupancyRatio - b.occupancyRatio);
  } else if (sortValue === 'name-asc') {
    result.sort((a, b) => a.name.localeCompare(b.name));
  }

  return result;
}

function renderZones(zones) {
  const processed = applyZoneFilterAndSort(zones);

  zonesGridEl.innerHTML = '';

  for (const zone of processed) {
    const ratio = zone.occupancyRatio;
    const occupancyKey = occupancyLabelFromRatio(ratio);
    const labelText = humanLabelFromKey(occupancyKey);
    const pct = Math.round(ratio * 100);

    const card = document.createElement('article');
    card.className = 'zone-card';

    const main = document.createElement('div');
    main.className = 'zone-main';

    const name = document.createElement('h3');
    name.className = 'zone-name';
    name.textContent = zone.name;

    const meta = document.createElement('div');
    meta.className = 'zone-meta';
    meta.innerHTML = `<strong>${zone.available}</strong> free of ${
      zone.capacity
    } seats`;

    main.appendChild(name);
    main.appendChild(meta);

    const meter = document.createElement('div');
    meter.className = 'zone-meter';

    const bar = document.createElement('div');
    bar.className = 'zone-meter-bar';
    const fill = document.createElement('div');
    fill.className = 'zone-meter-fill';
    fill.style.transform = `scaleX(${Math.max(0.05, Math.min(0.99, ratio))})`;
    bar.appendChild(fill);

    const labels = document.createElement('div');
    labels.className = 'zone-meter-labels';
    labels.innerHTML = `<span>${pct}% occupied</span><span>${
      labelText || ''
    }</span>`;

    const chip = document.createElement('div');
    chip.className = `zone-chip ${occupancyKey}`;
    chip.innerHTML = `<span class="zone-chip-dot"></span>${labelText}`;

    meter.appendChild(bar);
    meter.appendChild(labels);
    meter.appendChild(chip);

    card.appendChild(main);
    card.appendChild(meter);

    zonesGridEl.appendChild(card);
  }

  if (processed.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'zone-meta';
    empty.textContent =
      'No zones match your current filters. Try changing the crowd level filter.';
    zonesGridEl.appendChild(empty);
  }
}

function renderForecast(aiInsight) {
  forecastListEl.innerHTML = '';

  if (!aiInsight || !Array.isArray(aiInsight.horizons)) return;

  aiInsight.horizons.forEach((point) => {
    const li = document.createElement('li');
    li.className = 'forecast-item';
    const minutes =
      point.minutesAhead === 0
        ? 'Now'
        : `In ${point.minutesAhead} min`;
    const pct = Math.round(point.predictedOccupancyRatio * 100);
    li.innerHTML = `<span>${minutes}</span><span>${pct}% · ${point.label}</span>`;
    forecastListEl.appendChild(li);
  });
}

function startAutoRefresh() {
  stopAutoRefresh();
  autoRefreshTimer = setInterval(fetchStatus, REFRESH_INTERVAL_MS);
}

function stopAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
}

sortSelectEl.addEventListener('change', () => {
  if (latestSnapshot) {
    renderZones(latestSnapshot.zones);
  }
});

filterSelectEl.addEventListener('change', () => {
  if (latestSnapshot) {
    renderZones(latestSnapshot.zones);
  }
});

autoRefreshToggleEl.addEventListener('change', (e) => {
  if (e.target.checked) {
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }
});

// ----- Auth UI -----

function openAuthDialog(mode) {
  authMode = mode || 'login';
  authDialogBackdropEl.classList.remove('auth-backdrop--hidden');
  authFeedbackEl.textContent = '';
  authFeedbackEl.classList.remove(
    'sidebar-feedback--success',
    'sidebar-feedback--error'
  );

  if (authMode === 'signup') {
    authTabSignupEl.classList.add('auth-tab--active');
    authTabLoginEl.classList.remove('auth-tab--active');
    authNameRowEl.classList.remove('form-row--hidden');
  } else {
    authTabLoginEl.classList.add('auth-tab--active');
    authTabSignupEl.classList.remove('auth-tab--active');
    authNameRowEl.classList.add('form-row--hidden');
  }
}

function closeAuthDialog() {
  authDialogBackdropEl.classList.add('auth-backdrop--hidden');
}

function setAuthState(user, session) {
  currentUser = user;
  sessionId = session || sessionId;

  if (currentUser) {
    authUserInfoEl.classList.remove('auth-user-info--hidden');
    authUserNameEl.textContent = currentUser.name || currentUser.email;
    authOpenButtonEl.textContent = 'Logout';
    if (seatZoneSelectEl) {
      loadSeatMap(selectedZoneId || seatZoneSelectEl.value);
    }
    bootstrapAfterAuth();
  } else {
    authUserInfoEl.classList.add('auth-user-info--hidden');
    authUserNameEl.textContent = '';
    authOpenButtonEl.textContent = 'Login / Signup';
    seatMapGridEl.innerHTML =
      '<div class="sidebar-feedback">Login to see your seat map.</div>';
  }
}

async function checkCurrentUser() {
  if (!sessionId) return false;
  try {
    const res = await fetch('/api/auth/me', {
      headers: {
        'x-session-id': sessionId
      }
    });
    if (!res.ok) {
      setAuthState(null, null);
      return false;
    }
    const data = await res.json();
    setAuthState(data.user, sessionId);
    return true;
  } catch {
    setAuthState(null, null);
    return false;
  }
}

authOpenButtonEl.addEventListener('click', async () => {
  if (currentUser && sessionId) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'x-session-id': sessionId
        }
      });
    } catch {
      // ignore
    }
    setAuthState(null, null);
    return;
  }

  openAuthDialog('login');
});

authCloseButtonEl.addEventListener('click', () => {
  closeAuthDialog();
});

authTabLoginEl.addEventListener('click', () => {
  openAuthDialog('login');
});

authTabSignupEl.addEventListener('click', () => {
  openAuthDialog('signup');
});

authFormEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  authFeedbackEl.textContent = '';
  authFeedbackEl.classList.remove(
    'sidebar-feedback--success',
    'sidebar-feedback--error'
  );

  const email = authEmailInputEl.value.trim();
  const password = authPasswordInputEl.value.trim();
  const name = authNameInputEl.value.trim();

  if (!email || !password || (authMode === 'signup' && !name)) {
    authFeedbackEl.textContent = 'Please fill in all required fields.';
    authFeedbackEl.classList.add('sidebar-feedback--error');
    return;
  }

  authSubmitButtonEl.disabled = true;
  authSubmitButtonEl.textContent = 'Please wait…';

  try {
    const endpoint = authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, email, password })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      authFeedbackEl.textContent = data.message || 'Something went wrong.';
      authFeedbackEl.classList.add('sidebar-feedback--error');
      return;
    }

    sessionId = data.sessionId;
    setAuthState(data.user, data.sessionId);
    closeAuthDialog();
  } catch (err) {
    console.error(err);
    authFeedbackEl.textContent = 'Unable to reach server.';
    authFeedbackEl.classList.add('sidebar-feedback--error');
  } finally {
    authSubmitButtonEl.disabled = false;
    authSubmitButtonEl.textContent = 'Continue';
  }
});

// ----- Seat booking with seat map -----

async function loadSeatMap(zoneId) {
  selectedZoneId = zoneId;
  seatBookMessageEl.textContent = '';
  seatBookMessageEl.classList.remove(
    'sidebar-feedback--error',
    'sidebar-feedback--success'
  );

  if (!currentUser || !sessionId) {
    seatMapGridEl.innerHTML =
      '<div class="sidebar-feedback sidebar-feedback--error">Login to view and book seats.</div>';
    return;
  }

  try {
    const res = await fetch(`/api/seats/map?zoneId=${encodeURIComponent(zoneId)}`, {
      headers: {
        'x-session-id': sessionId
      }
    });
    const data = await res.json();
    if (!res.ok) {
      seatMapGridEl.innerHTML =
        '<div class="sidebar-feedback sidebar-feedback--error">Unable to load seats.</div>';
      return;
    }
    seatMapData = data;
    renderSeatMap();
  } catch {
    seatMapGridEl.innerHTML =
      '<div class="sidebar-feedback sidebar-feedback--error">Unable to load seats.</div>';
  }
}

function renderSeatMap() {
  if (!seatMapData) {
    seatMapGridEl.innerHTML = '';
    return;
  }

  seatMapGridEl.innerHTML = '';

  seatMapData.seats.forEach((seat) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'seat-cell';

    if (seat.status === 'booked') {
      cell.classList.add('seat-cell--booked');
    }
    if (seat.isMine) {
      cell.classList.add('seat-cell--yours');
    }
    if (seat.hasPower) {
      cell.classList.add('seat-cell--has-power');
    }

    cell.textContent = String(seat.seatNumber);

    if (!seat.isMine && seat.status === 'booked') {
      cell.disabled = true;
    } else {
      cell.addEventListener('click', () => handleSeatClick(seat));
    }

    seatMapGridEl.appendChild(cell);
  });
}

async function handleSeatClick(seat) {
  if (!currentUser || !sessionId) {
    openAuthDialog('login');
    return;
  }

  seatBookMessageEl.textContent = '';
  seatBookMessageEl.classList.remove(
    'sidebar-feedback--error',
    'sidebar-feedback--success'
  );

  const zoneId = selectedZoneId || seatZoneSelectEl.value;

  const endpoint = seat.isMine ? '/api/seats/releaseSeat' : '/api/seats/bookSeat';

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': sessionId
      },
      body: JSON.stringify({ zoneId, seatNumber: seat.seatNumber })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      seatBookMessageEl.textContent = data.message || 'Unable to update seat.';
      seatBookMessageEl.classList.add('sidebar-feedback--error');
      return;
    }

    seatBookMessageEl.textContent = data.message || 'Updated.';
    seatBookMessageEl.classList.add('sidebar-feedback--success');

    if (data.seatMap) {
      seatMapData = data.seatMap;
      renderSeatMap();
    } else {
      loadSeatMap(zoneId);
    }

    fetchStatus();
  } catch {
    seatBookMessageEl.textContent = 'Unable to reach server.';
    seatBookMessageEl.classList.add('sidebar-feedback--error');
  }
}

if (seatZoneSelectEl) {
  seatZoneSelectEl.addEventListener('change', () => {
    loadSeatMap(seatZoneSelectEl.value);
  });
}

// ----- Book search & reservations -----

async function runBookSearch() {
  const q = bookSearchInputEl.value.trim();
  bookResultsEl.innerHTML = '';
  const url = q ? `/api/books?q=${encodeURIComponent(q)}` : '/api/books';

  try {
    const res = await fetch(url);
    const data = await res.json();
    const list = data.books || [];

    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'sidebar-feedback';
      empty.textContent = 'No books found for that search.';
      bookResultsEl.appendChild(empty);
      return;
    }

    list.forEach((book) => {
      const card = document.createElement('div');
      card.className = 'book-card';

      const title = document.createElement('p');
      title.className = 'book-title';
      title.textContent = book.title;

      const author = document.createElement('p');
      author.className = 'book-author';
      author.textContent = book.author;

      const meta = document.createElement('div');
      meta.className = 'book-meta';

      const availability = document.createElement('span');
      availability.innerHTML = `<strong>${book.availableCopies}</strong> of ${book.totalCopies} available`;

      const reserveBtn = document.createElement('button');
      reserveBtn.className = 'btn-ghost-small';
      reserveBtn.textContent = 'Reserve';
      reserveBtn.disabled = !book.isReservable;

      reserveBtn.addEventListener('click', () => reserveBook(book.id, reserveBtn));

      meta.appendChild(availability);
      meta.appendChild(reserveBtn);

      card.appendChild(title);
      card.appendChild(author);
      card.appendChild(meta);

      bookResultsEl.appendChild(card);
    });
  } catch {
    const errorEl = document.createElement('div');
    errorEl.className = 'sidebar-feedback sidebar-feedback--error';
    errorEl.textContent = 'Unable to load books.';
    bookResultsEl.appendChild(errorEl);
  }
}

async function reserveBook(bookId, buttonEl) {
  if (!currentUser || !sessionId) {
    buttonEl.textContent = 'Login required';
    return;
  }

  buttonEl.disabled = true;
  buttonEl.textContent = 'Reserving…';

  try {
    const res = await fetch(`/api/books/${bookId}/reserve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': sessionId
      }
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      buttonEl.textContent = data.message || 'Unavailable';
      return;
    }

    buttonEl.textContent = 'Reserved';
  } catch {
    buttonEl.textContent = 'Error';
  }
}

bookSearchButtonEl.addEventListener('click', () => {
  runBookSearch();
});

bookSearchInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    runBookSearch();
  }
});

// ----- Bootstrap -----

function bootstrapAfterAuth() {
  if (appBootstrapped) return;
  appBootstrapped = true;
  fetchStatus();
  startAutoRefresh();
  runBookSearch();
  if (seatZoneSelectEl) {
    loadSeatMap(seatZoneSelectEl.value);
  }
}

(async function init() {
  const authed = await checkCurrentUser();
  if (!authed) {
    openAuthDialog('login');
  }
})();

