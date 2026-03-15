const API_URL = '/api/status';
const REFRESH_INTERVAL_MS = 10_000;

let latestSnapshot = null;
let autoRefreshTimer = null;
let sessionId = localStorage.getItem('librarySessionId') || null;
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

const smartRecommendationEl = document.getElementById('smartRecommendation');
const smartRecommendationTextEl = document.getElementById('smartRecommendationText');
const weeklyAnalyticsChartEl = document.getElementById('weeklyAnalyticsChart');

let chartInstance = null;

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

const sidebarCheckInStatus = document.getElementById('sidebarCheckInStatus');

const seatZoneSelectEl = document.getElementById('seatZoneSelect');
const seatTimeSlotSelectEl = document.getElementById('seatTimeSlotSelect');
const seatMapGridEl = document.getElementById('seatMapGrid');
const seatBookMessageEl = document.getElementById('seatBookMessage');

const bookSearchInputEl = document.getElementById('bookSearchInput');
const bookSearchButtonEl = document.getElementById('bookSearchButton');
const bookResultsEl = document.getElementById('bookResults');

const forecastListEl = document.getElementById('forecastList');

let authMode = 'login';
let seatMapData = null;
let selectedZoneId = seatZoneSelectEl ? seatZoneSelectEl.value : 'silent';
let selectedTimeSlot = 'now-2hrs';
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
  if (!crowdLabelEl) return;
  crowdLabelEl.textContent = 'Connection issue';
  crowdLabelEl.style.background =
    'radial-gradient(circle at 0 0, rgba(248,113,113,0.5), transparent), rgba(15,23,42,0.95)';
  if (lastUpdatedEl) lastUpdatedEl.textContent = 'Last updated: unable to reach server';
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
  if (!totalCapacityEl) return;
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
  renderSmartRecommendation(zones);
  renderForecast(aiInsight);
}

function renderSmartRecommendation(zones) {
  if (!zones || zones.length === 0) {
    smartRecommendationEl.classList.add('hidden');
    return;
  }
  
  // Find zone with the lowest occupancy ratio and > 0 available seats
  const availableZones = zones.filter(z => z.available > 0);
  if (availableZones.length === 0) {
    smartRecommendationEl.classList.add('hidden');
    return;
  }
  
  const bestZone = availableZones.reduce((prev, curr) => 
    prev.occupancyRatio < curr.occupancyRatio ? prev : curr
  );
  
  smartRecommendationTextEl.innerHTML = `<strong>${bestZone.name}</strong> is currently the quietest with ${bestZone.available} seats available.`;
  smartRecommendationEl.classList.remove('hidden');
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

if (sortSelectEl) {
  sortSelectEl.addEventListener('change', () => {
    if (latestSnapshot) {
      renderZones(latestSnapshot.zones);
    }
  });
}

if (filterSelectEl) {
  filterSelectEl.addEventListener('change', () => {
    if (latestSnapshot) {
      renderZones(latestSnapshot.zones);
    }
  });
}

if (autoRefreshToggleEl) {
  autoRefreshToggleEl.addEventListener('change', (e) => {
    if (e.target.checked) {
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
  });
}

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

  if (sessionId) {
    localStorage.setItem('librarySessionId', sessionId);
  }

  if (currentUser) {
    authUserInfoEl.classList.remove('auth-user-info--hidden');
    authUserNameEl.textContent = currentUser.name || currentUser.email;
    authOpenButtonEl.textContent = 'Logout';
    if (seatZoneSelectEl) {
      loadSeatMap(selectedZoneId || seatZoneSelectEl.value, selectedTimeSlot);
    }
    bootstrapAfterAuth();
  } else {
    localStorage.removeItem('librarySessionId');
    authUserInfoEl.classList.add('auth-user-info--hidden');
    authUserNameEl.textContent = '';
    authOpenButtonEl.textContent = 'Login / Signup';
    if (seatMapGridEl) {
      seatMapGridEl.innerHTML =
        '<div class="sidebar-feedback">Login to see your seat map.</div>';
    }
  }
}

async function checkCurrentUser() {
  if (!sessionId) {
    setAuthState(null, null);
    return false;
  }
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

if (authOpenButtonEl) {
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
}

if (authCloseButtonEl) {
  authCloseButtonEl.addEventListener('click', () => {
    closeAuthDialog();
  });
}

if (authTabLoginEl) {
  authTabLoginEl.addEventListener('click', () => {
    openAuthDialog('login');
  });
}

if (authTabSignupEl) {
  authTabSignupEl.addEventListener('click', () => {
    openAuthDialog('signup');
  });
}

if (authFormEl) {
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
      if (authSubmitButtonEl) {
        authSubmitButtonEl.disabled = false;
        authSubmitButtonEl.textContent = 'Continue';
      }
    }
  });
}

// ----- Seat booking with seat map -----

function populateTimeSlots() {
  if (!seatTimeSlotSelectEl) return;
  seatTimeSlotSelectEl.innerHTML = '';
  
  const options = [
    { value: '09:30-13:00', label: 'Morning Session (09:30 AM - 01:00 PM)' },
    { value: '13:45-20:00', label: 'Afternoon Session (01:45 PM - 08:00 PM)' }
  ];

  options.forEach((opt, index) => {
    const el = document.createElement('option');
    el.value = opt.value;
    el.textContent = opt.label;
    if (index === 0) selectedTimeSlot = opt.value;
    seatTimeSlotSelectEl.appendChild(el);
  });
}

async function loadSeatMap(zoneId, slot) {
  selectedZoneId = zoneId;
  selectedTimeSlot = slot || (seatTimeSlotSelectEl ? seatTimeSlotSelectEl.value : null);
  seatBookMessageEl.textContent = '';
  seatBookMessageEl.classList.remove(
    'sidebar-feedback--error',
    'sidebar-feedback--success'
  );

  if (!currentUser || !sessionId) {
    if (seatMapGridEl) {
      seatMapGridEl.innerHTML =
        '<div class="sidebar-feedback sidebar-feedback--error">Login to view and book seats.</div>';
    }
    return;
  }

  try {
    let url = `/api/seats/map?zoneId=${encodeURIComponent(zoneId)}`;
    if (selectedTimeSlot) {
      url += `&slot=${encodeURIComponent(selectedTimeSlot)}`;
    }
    
    const res = await fetch(url, {
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

function updateSidebarStatus() {
  if (!sidebarCheckInStatus || !seatMapData || !seatMapData.seats) return;
  const mySeats = seatMapData.seats.filter(s => s.isMine);
  
  if (mySeats.length === 0) {
    sidebarCheckInStatus.innerHTML = '<span style="color:var(--text-soft); font-size: 0.8rem;">You have no booked seats.</span>';
    return;
  }
  
  const uncheckedSeats = mySeats.filter(s => !s.isCheckedIn);
  if (uncheckedSeats.length > 0) {
    sidebarCheckInStatus.innerHTML = `<span style="color: var(--accent-strong); font-size: 0.8rem; font-weight: 600;">⌛ Pending check-in for ${uncheckedSeats.length} seats.</span>`;
  } else {
    sidebarCheckInStatus.innerHTML = `<span style="color: #10b981; font-size: 0.8rem;">✅ Checked in to ${mySeats.length} seats.</span>`;
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
      if (seat.isCheckedIn) {
        cell.classList.add('seat-cell--checked-in');
      } else {
        cell.classList.add('seat-cell--booked');
      }
    }
    if (seat.isMine && !seat.isCheckedIn) {
      cell.classList.add('seat-cell--yours');
    }
    if (seat.hasPower) {
      cell.classList.add('seat-cell--has-power');
    }

    cell.textContent = String(seat.seatNumber);
    let titleMsg = `Seat ${seat.seatNumber}`;
    if (seat.hasPower) titleMsg += ' (Electric Port)';
    
    if (seat.isCheckedIn) {
      if (seat.isMine) titleMsg += ' - Occupied by you';
      else titleMsg += ' - Occupied';
    } else if (seat.isMine) {
      titleMsg += ' - Booked by you (Pending)';
    } else if (seat.status === 'booked') {
      titleMsg += ' - Booked (Pending)';
    } else {
      titleMsg += ' - Free';
    }
    cell.title = titleMsg;

    if (!seat.isMine && seat.status === 'booked') {
      cell.disabled = true;
    } else {
      cell.addEventListener('click', () => handleSeatClick(seat));
    }

    seatMapGridEl.appendChild(cell);
  });

  updateSidebarStatus();
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

  if (seat.isMine) {
    seatBookMessageEl.textContent = 'Only an administrator can remove your booking. Please ask the desk.';
    seatBookMessageEl.classList.add('sidebar-feedback--error');
    return;
  }

  const endpoint = '/api/seats/bookSeat';

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': sessionId
      },
      body: JSON.stringify({ 
        zoneId, 
        seatNumber: seat.seatNumber,
        slot: selectedTimeSlot
      })
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
      loadSeatMap(zoneId, selectedTimeSlot);
    }

    fetchStatus();
  } catch {
    seatBookMessageEl.textContent = 'Unable to reach server.';
    seatBookMessageEl.classList.add('sidebar-feedback--error');
  }
}

if (seatZoneSelectEl) {
  seatZoneSelectEl.addEventListener('change', () => {
    loadSeatMap(seatZoneSelectEl.value, selectedTimeSlot);
  });
}

if (seatTimeSlotSelectEl) {
  seatTimeSlotSelectEl.addEventListener('change', () => {
    selectedTimeSlot = seatTimeSlotSelectEl.value;
    loadSeatMap(selectedZoneId || seatZoneSelectEl.value, selectedTimeSlot);
  });
}

// ----- Book search & reservations -----

async function runBookSearch() {
  if (!bookSearchInputEl || !bookResultsEl) return;
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

    // Group books by department, then by section
    const groupedBooks = list.reduce((acc, book) => {
      const dept = book.department || 'Other';
      const sec = book.section || 'General';
      
      if (!acc[dept]) acc[dept] = {};
      if (!acc[dept][sec]) acc[dept][sec] = [];
      
      acc[dept][sec].push(book);
      return acc;
    }, {});

    Object.keys(groupedBooks).forEach((department) => {
      // Create Department Section
      const deptSection = document.createElement('div');
      deptSection.className = 'department-section';

      const deptHeader = document.createElement('h3');
      deptHeader.className = 'department-header';
      deptHeader.textContent = department;
      deptSection.appendChild(deptHeader);

      const tableContainer = document.createElement('div');
      tableContainer.className = 'table-container';
      
      const table = document.createElement('table');
      table.innerHTML = `
        <thead>
          <tr>
            <th>Book Details</th>
            <th>Section</th>
            <th>Availability</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
      const tbody = table.querySelector('tbody');

      // Iterate over Sections within the Department
      Object.keys(groupedBooks[department]).forEach((sectionName) => {
        groupedBooks[department][sectionName].forEach((book) => {
          const tr = document.createElement('tr');

          const detailsTd = document.createElement('td');
          detailsTd.innerHTML = `<strong>${book.title}</strong><br/><small style="color:var(--text-soft)">${book.author}</small>`;

          const sectionTd = document.createElement('td');
          sectionTd.textContent = sectionName;

          const availabilityTd = document.createElement('td');
          availabilityTd.innerHTML = `<strong>${book.availableCopies}</strong> of ${book.totalCopies}`;

          const actionTd = document.createElement('td');
          
          const reserveBtn = document.createElement('button');
          
          const alreadyReservedByMe = currentUser && book.reservedByUserIds && book.reservedByUserIds.includes(currentUser.id);

          if (alreadyReservedByMe) {
            reserveBtn.textContent = 'Reserved';
            reserveBtn.disabled = true;
            reserveBtn.className = 'badge success';
            reserveBtn.style.border = 'none';
          } else if (!book.isReservable) {
            reserveBtn.textContent = 'Out of Stock';
            reserveBtn.disabled = true;
            reserveBtn.className = 'badge danger';
            reserveBtn.style.border = 'none';
          } else {
            reserveBtn.textContent = 'Reserve';
            reserveBtn.className = 'btn-primary';
            reserveBtn.style.padding = '4px 12px';
            reserveBtn.style.fontSize = '0.75rem';
            reserveBtn.addEventListener('click', () => reserveBook(book.id, reserveBtn, availabilityTd));
          }

          actionTd.appendChild(reserveBtn);

          tr.appendChild(detailsTd);
          tr.appendChild(sectionTd);
          tr.appendChild(availabilityTd);
          tr.appendChild(actionTd);

          tbody.appendChild(tr);
        });
      });

      tableContainer.appendChild(table);
      deptSection.appendChild(tableContainer);
      bookResultsEl.appendChild(deptSection);
    });
  } catch {
    const errorEl = document.createElement('div');
    errorEl.className = 'sidebar-feedback sidebar-feedback--error';
    errorEl.textContent = 'Unable to load books.';
    bookResultsEl.appendChild(errorEl);
  }
}

async function reserveBook(bookId, buttonEl, availabilityEl) {
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

    // Update the local availability DOM to reflect the new copies
    if (data.book && availabilityEl) {
      availabilityEl.innerHTML = `<strong>${data.book.availableCopies}</strong> of ${data.book.totalCopies}`;
      
      if (data.book.availableCopies === 0) {
        buttonEl.textContent = 'Out of Stock';
        buttonEl.className = 'badge danger';
        buttonEl.style.border = 'none';
      } else {
        buttonEl.textContent = 'Reserved';
        buttonEl.className = 'badge success';
        buttonEl.style.border = 'none';
      }
    } else {
      buttonEl.textContent = 'Reserved';
      buttonEl.className = 'badge success';
      buttonEl.style.border = 'none';
    }
  } catch {
    buttonEl.textContent = 'Error';
  }
}

if (bookSearchButtonEl) {
  bookSearchButtonEl.addEventListener('click', () => {
    runBookSearch();
  });
}

if (bookSearchInputEl) {
  bookSearchInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runBookSearch();
    }
  });
}

// ----- Bootstrap -----

async function renderWeeklyAnalytics() {
  if (!weeklyAnalyticsChartEl) return;
  
  try {
    const res = await fetch('/api/analytics/weekly');
    if (!res.ok) return;
    const data = await res.json();
    
    if (chartInstance) {
      chartInstance.destroy();
    }
    
    chartInstance = new Chart(weeklyAnalyticsChartEl, {
      type: 'line',
      data: data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#94a3b8' }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255, 255, 255, 0.1)' },
            ticks: { color: '#94a3b8' },
            title: { display: true, text: 'Occupied Seats', color: '#94a3b8' }
          },
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.1)' },
            ticks: { color: '#94a3b8' }
          }
        },
        elements: {
          line: { tension: 0.4 }, // Smooth curves
          point: { radius: 2 }
        }
      }
    });
  } catch (err) {
    console.error('Failed to load weekly analytics', err);
  }
}

function bootstrapAfterAuth() {
  if (appBootstrapped) return;
  appBootstrapped = true;
  populateTimeSlots();
  fetchStatus();
  startAutoRefresh();
  runBookSearch();
  renderWeeklyAnalytics();
  if (seatZoneSelectEl) {
    loadSeatMap(seatZoneSelectEl.value, selectedTimeSlot);
  }
}

(async function init() {
  const authed = await checkCurrentUser();
  if (!authed) {
    openAuthDialog('login');
  }
})();

