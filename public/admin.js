const loginSection = document.getElementById('loginSection');
const dashboardSection = document.getElementById('dashboardSection');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const errorMsg = document.getElementById('errorMsg');

const usersTableBody = document.querySelector('#usersTable tbody');
const bookingsTableBody = document.querySelector('#bookingsTable tbody');
const libraryBranchesContainer = document.getElementById('libraryBranchesContainer');

const settingBranchSelector = document.getElementById('settingBranchSelector');
const settingMaxBooks = document.getElementById('settingMaxBooks');
const settingSeatLimit = document.getElementById('settingSeatLimit');
const settingEmailAlerts = document.getElementById('settingEmailAlerts');
const settingDueDateReminders = document.getElementById('settingDueDateReminders');
const settingNewBookAlerts = document.getElementById('settingNewBookAlerts');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const settingsMsg = document.getElementById('settingsMsg');

const profileAvatar = document.getElementById('profileAvatar');
const profileNameDisplay = document.getElementById('profileNameDisplay');
const profileEmailDisplay = document.getElementById('profileEmailDisplay');
const editProfileBtn = document.getElementById('editProfileBtn');
const profileViewMode = document.getElementById('profileViewMode');
const profileEditMode = document.getElementById('profileEditMode');
const profileNameInput = document.getElementById('profileNameInput');
const profileEmailInput = document.getElementById('profileEmailInput');
const saveProfileBtn = document.getElementById('saveProfileBtn');
const cancelProfileBtn = document.getElementById('cancelProfileBtn');
const profileMsg = document.getElementById('profileMsg');

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

      // Populate current admin profile
      if (u.isAdmin && u.id === data.userId) { // Need to return userId from /api/admin/data
         updateProfileUI(u.name, u.email);
      }
    });

    // Render Bookings
    bookingsTableBody.innerHTML = '';
    if (data.SeatBookings.length === 0) {
      bookingsTableBody.innerHTML = '<tr><td colspan="5">No active bookings.</td></tr>';
    } else {
      data.SeatBookings.forEach(b => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${b.zoneName} - Seat ${b.seatNumber}</td>
          <td>${b.slot}</td>
          <td>${b.userName} <br/><small style="color:var(--text-soft)">${b.userEmail}</small></td>
          <td><span class="badge ${b.isCheckedIn ? 'success' : 'pending'}">${b.isCheckedIn ? 'Checked In' : 'Pending'}</span></td>
          <td>
            ${!b.isCheckedIn ? `<button onclick="adminCheckIn('${b.zoneId}', ${b.seatNumber}, '${b.slot}', '${b.userId}')" style="margin-right: 5px; padding: 4px 8px; font-size: 0.8rem; cursor: pointer; background: #10b981; color: white; border: none; border-radius: 4px;">Check In</button>` : ''}
            <button onclick="adminReleaseSeat('${b.zoneId}', ${b.seatNumber}, '${b.slot}')" style="padding: 4px 8px; font-size: 0.8rem; cursor: pointer; background: #ef4444; color: white; border: none; border-radius: 4px;">Remove</button>
          </td>
        `;
        bookingsTableBody.appendChild(tr);
      });
    }

    // Render Branches
    libraryBranchesContainer.innerHTML = '';
    if (!data.branches || data.branches.length === 0) {
      libraryBranchesContainer.innerHTML = '<div class="card" style="grid-column: span 2;"><p>No books currently reserved or issued.</p></div>';
    } else {
      data.branches.forEach(branch => {
        const branchCard = document.createElement('div');
        branchCard.className = 'card';
        
        let html = `<h2>Branch: ${branch.name}</h2>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Book Title</th>
                  <th>Student</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>`;

        if (branch.reservedBooks.length === 0 && branch.issuedBooks.length === 0) {
           html += `<tr><td colspan="4">No books reserved or issued in this branch.</td></tr>`;
        }

        // Render Reserved Books
        branch.reservedBooks.forEach(b => {
          html += `
            <tr>
              <td>${b.title}</td>
              <td>${b.userName} <br/><small style="color:var(--text-soft)">${b.userEmail}</small></td>
              <td><span class="badge pending">Reserved</span></td>
              <td>
                <button onclick="adminIssueBook('${b.id}', '${b.userId}')" style="margin-right: 5px; padding: 4px 8px; font-size: 0.8rem; cursor: pointer; background: #3b82f6; color: white; border: none; border-radius: 4px;">Issue</button>
              </td>
            </tr>
          `;
        });

        // Render Issued Books
        branch.issuedBooks.forEach(b => {
          html += `
            <tr>
              <td>${b.title}</td>
              <td>${b.userName} <br/><small style="color:var(--text-soft)">${b.userEmail}</small></td>
              <td><span class="badge success">Issued</span></td>
              <td>
                <button onclick="adminReturnBook('${b.id}', '${b.userId}')" style="padding: 4px 8px; font-size: 0.8rem; cursor: pointer; background: #10b981; color: white; border: none; border-radius: 4px;">Return</button>
              </td>
            </tr>
          `;
        });

        html += `</tbody></table></div>`;
        branchCard.innerHTML = html;
        libraryBranchesContainer.appendChild(branchCard);
      });
    }

    // Load Settings
    const settingsRes = await fetch('/api/admin/settings', {
      headers: { 'x-session-id': sessionId }
    });
    if (settingsRes.ok) {
      const settingsData = await settingsRes.json();
      settingBranchSelector.value = settingsData.branchSelector;
      settingMaxBooks.value = settingsData.maxBooksPerStudent;
      settingSeatLimit.value = settingsData.seatBookingTimeLimit;
      settingEmailAlerts.checked = settingsData.emailAlerts;
      settingDueDateReminders.checked = settingsData.dueDateReminders;
      settingNewBookAlerts.checked = settingsData.newBookAlerts;
    }

    loginSection.style.display = 'none';
    dashboardSection.style.display = 'block';

  } catch (err) {
    console.error('Failed to load dashboard', err);
  }
}

// Settings Action
if (saveSettingsBtn) {
  saveSettingsBtn.addEventListener('click', async () => {
    saveSettingsBtn.disabled = true;
    saveSettingsBtn.textContent = 'Saving...';
    settingsMsg.textContent = '';
    settingsMsg.style.color = '';

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': sessionId
        },
        body: JSON.stringify({
          branchSelector: settingBranchSelector.value,
          maxBooksPerStudent: parseInt(settingMaxBooks.value, 10) || 2,
          seatBookingTimeLimit: parseInt(settingSeatLimit.value, 10) || 120,
          emailAlerts: settingEmailAlerts.checked,
          dueDateReminders: settingDueDateReminders.checked,
          newBookAlerts: settingNewBookAlerts.checked
        })
      });

      const data = await res.json();
      if (res.ok) {
        settingsMsg.textContent = 'Settings saved.';
        settingsMsg.style.color = '#10b981'; // success green
        setTimeout(() => { settingsMsg.textContent = ''; }, 3000);
      } else {
        settingsMsg.textContent = data.message || 'Failed to save.';
        settingsMsg.style.color = '#ef4444'; // error red
      }
    } catch (err) {
      settingsMsg.textContent = 'Network error.';
      settingsMsg.style.color = '#ef4444';
    } finally {
      saveSettingsBtn.disabled = false;
      saveSettingsBtn.textContent = 'Save Settings';
    }
  });
}

function updateProfileUI(name, email) {
  profileNameDisplay.textContent = name;
  profileEmailDisplay.textContent = email;
  profileNameInput.value = name;
  profileEmailInput.value = email;
  
  if (name && name.length > 0) {
    profileAvatar.textContent = name.charAt(0).toUpperCase();
  }
}

if (editProfileBtn) {
  editProfileBtn.addEventListener('click', () => {
    profileViewMode.style.display = 'none';
    profileEditMode.style.display = 'block';
  });
}

if (cancelProfileBtn) {
  cancelProfileBtn.addEventListener('click', () => {
    profileEditMode.style.display = 'none';
    profileViewMode.style.display = 'block';
    profileMsg.textContent = '';
  });
}

if (saveProfileBtn) {
  saveProfileBtn.addEventListener('click', async () => {
    saveProfileBtn.disabled = true;
    profileMsg.textContent = 'Saving...';
    profileMsg.style.color = 'var(--text-soft)';

    try {
      const res = await fetch('/api/admin/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': sessionId
        },
        body: JSON.stringify({
          name: profileNameInput.value,
          email: profileEmailInput.value
        })
      });

      const data = await res.json();
      if (res.ok) {
        updateProfileUI(data.user.name, data.user.email);
        profileMsg.textContent = 'Profile updated.';
        profileMsg.style.color = '#10b981';
        
        setTimeout(() => {
          profileEditMode.style.display = 'none';
          profileViewMode.style.display = 'block';
          profileMsg.textContent = '';
        }, 1500);
      } else {
        profileMsg.textContent = data.message || 'Failed to update profile.';
        profileMsg.style.color = '#ef4444';
      }
    } catch (err) {
      profileMsg.textContent = 'Network error.';
      profileMsg.style.color = '#ef4444';
    } finally {
      saveProfileBtn.disabled = false;
    }
  });
}

// Admin Action Functions
async function adminCheckIn(zoneId, seatNumber, slot, userId) {
  try {
    const res = await fetch('/api/seats/checkIn', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': sessionId
      },
      body: JSON.stringify({ zoneId, seatNumber, slot, userId })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.message || 'Check-in failed');
    }
    // Refresh the dashboard
    await fetchDashboardData();
  } catch (err) {
    alert('Failed to connect to server.');
  }
}

async function adminReleaseSeat(zoneId, seatNumber, slot) {
  if (!confirm('Are you sure you want to remove this booking?')) return;
  
  try {
    const res = await fetch('/api/seats/adminRelease', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': sessionId
      },
      body: JSON.stringify({ zoneId, seatNumber, slot })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.message || 'Release failed');
    }
    // Refresh the dashboard
    await fetchDashboardData();
  } catch (err) {
    alert('Failed to connect to server.');
  }
}

async function adminIssueBook(bookId, userId) {
  try {
    const res = await fetch('/api/admin/books/issue', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': sessionId
      },
      body: JSON.stringify({ bookId, userId })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.message || 'Issue failed');
    }
    await fetchDashboardData();
  } catch (err) {
    alert('Failed to connect to server.');
  }
}

async function adminReturnBook(bookId, userId) {
  try {
    const res = await fetch('/api/admin/books/return', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': sessionId
      },
      body: JSON.stringify({ bookId, userId })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.message || 'Return failed');
    }
    await fetchDashboardData();
  } catch (err) {
    alert('Failed to connect to server.');
  }
}

// Init
checkSession();
