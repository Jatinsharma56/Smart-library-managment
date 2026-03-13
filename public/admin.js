const loginSection = document.getElementById('loginSection');
const dashboardSection = document.getElementById('dashboardSection');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const errorMsg = document.getElementById('errorMsg');

const usersTableBody = document.querySelector('#usersTable tbody');
const bookingsTableBody = document.querySelector('#bookingsTable tbody');
const booksTableBody = document.querySelector('#booksTable tbody');

let sessionId = localStorage.getItem('adminSessionId') || null;

async function checkSession() {
  if (sessionId) {
    await fetchDashboardData();
  }
}

loginBtn.addEventListener('click', async () => {
  errorMsg.textContent = '';
  loginBtn.disabled = true;
  loginBtn.textContent = 'Logging in...';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailInput.value, password: passwordInput.value })
    });

    const data = await res.json();
    if (res.ok) {
      if (data.user.isAdmin) {
        sessionId = data.sessionId;
        localStorage.setItem('adminSessionId', sessionId);
        await fetchDashboardData();
      } else {
        errorMsg.textContent = 'You are not an administrator.';
      }
    } else {
      errorMsg.textContent = data.message || 'Login failed.';
    }
  } catch (err) {
    errorMsg.textContent = 'Network error.';
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Login';
  }
});

logoutBtn.addEventListener('click', () => {
  sessionId = null;
  localStorage.removeItem('adminSessionId');
  dashboardSection.style.display = 'none';
  loginSection.style.display = 'block';
});

async function fetchDashboardData() {
  try {
    const res = await fetch('/api/admin/data', {
      headers: { 'x-session-id': sessionId }
    });
    
    if (res.status === 401 || res.status === 403) {
      logoutBtn.click();
      return;
    }

    const data = await res.json();
    
    // Render Users
    usersTableBody.innerHTML = '';
    data.users.forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${u.name}</td>
        <td>${u.email}</td>
        <td><span class="badge ${u.isAdmin ? 'success' : ''}">${u.isAdmin ? 'Admin' : 'User'}</span></td>
      `;
      usersTableBody.appendChild(tr);
    });

    // Render Bookings
    bookingsTableBody.innerHTML = '';
    if (data.SeatBookings.length === 0) {
      bookingsTableBody.innerHTML = '<tr><td colspan="4">No active bookings.</td></tr>';
    } else {
      data.SeatBookings.forEach(b => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${b.zoneName} - Seat ${b.seatNumber}</td>
          <td>${b.slot}</td>
          <td>${b.userName} <br/><small style="color:var(--text-soft)">${b.userEmail}</small></td>
          <td><span class="badge ${b.isCheckedIn ? 'success' : ''}">${b.isCheckedIn ? 'Checked In' : 'Pending'}</span></td>
        `;
        bookingsTableBody.appendChild(tr);
      });
    }

    // Render Books
    booksTableBody.innerHTML = '';
    if (data.reservedBooks.length === 0) {
      booksTableBody.innerHTML = '<tr><td colspan="2">No books reserved.</td></tr>';
    } else {
      data.reservedBooks.forEach(b => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${b.title}</td>
          <td>${b.userName} <br/><small style="color:var(--text-soft)">${b.userEmail}</small></td>
        `;
        booksTableBody.appendChild(tr);
      });
    }

    loginSection.style.display = 'none';
    dashboardSection.style.display = 'block';

  } catch (err) {
    console.error('Failed to load dashboard', err);
  }
}

// Init
checkSession();
