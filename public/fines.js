const loginBtn = document.getElementById('loginBtn');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const errorMsg = document.getElementById('errorMsg');

const loginSection = document.getElementById('loginSection');
const finesDashboardSection = document.getElementById('finesDashboardSection');
const logoutBtn = document.getElementById('logoutBtn');

const overdueTableBody = document.querySelector('#overdueTable tbody');
const recordedFinesTableBody = document.querySelector('#recordedFinesTable tbody');

const totalPendingStat = document.getElementById('totalPendingStat');
const totalCollectedStat = document.getElementById('totalCollectedStat');

let sessionId = localStorage.getItem('adminSessionId') || null;

async function checkSession() {
  if (sessionId) {
    await fetchFinesData();
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
        await fetchFinesData();
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
    loginBtn.textContent = 'Login to Fines Dashboard';
  }
});

logoutBtn.addEventListener('click', () => {
  sessionId = null;
  localStorage.removeItem('adminSessionId');
  finesDashboardSection.style.display = 'none';
  loginSection.style.display = 'block';
});

async function fetchFinesData() {
  try {
    const res = await fetch('/api/admin/fines', {
      headers: { 'x-session-id': sessionId }
    });
    
    if (res.status === 401 || res.status === 403) {
      logoutBtn.click();
      return;
    }

    const data = await res.json();
    console.log(data);

    let totalPending = 0;
    let totalCollected = 0;

    // Overdue Books
    overdueTableBody.innerHTML = '';
    if (data.overdueBooks.length === 0) {
      overdueTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No overdue books found.</td></tr>';
    } else {
      data.overdueBooks.forEach(f => {
        totalPending += f.calculatedFine;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${f.userName} <br/><small style="color:var(--text-soft)">${f.userEmail}</small></td>
          <td>${f.bookTitle}</td>
          <td>${new Date(f.dueDate).toLocaleDateString()}</td>
          <td><span style="color: var(--danger); font-weight: 600;">${f.overdueDays} days</span></td>
          <td>$${f.calculatedFine.toFixed(2)}</td>
          <td>
             <button onclick="adminMarkFinePaid('${f.issueId}', '${f.userId}', '${f.bookId}', ${f.calculatedFine})" class="btn-primary" style="padding: 4px 10px; font-size: 0.85rem;">Mark Paid</button>
          </td>
        `;
        overdueTableBody.appendChild(tr);
      });
    }

    // Recorded Fines
    recordedFinesTableBody.innerHTML = '';
    if (data.recordedFines.length === 0) {
      recordedFinesTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No recorded fines found.</td></tr>';
    } else {
      data.recordedFines.forEach(f => {
        if (f.status === 'paid') totalCollected += f.amount;
        else if (f.status === 'pending') totalPending += f.amount;

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${f.userName} <br/><small style="color:var(--text-soft)">${f.userEmail}</small></td>
          <td>${f.bookTitle}</td>
          <td>$${f.amount.toFixed(2)}</td>
          <td><span class="badge ${f.status === 'paid' ? 'success' : 'pending'}" style="text-transform: capitalize;">${f.status}</span></td>
          <td>${new Date(f.date).toLocaleDateString()}</td>
        `;
        recordedFinesTableBody.appendChild(tr);
      });
    }

    // Update Stats UI
    if (totalPendingStat) totalPendingStat.textContent = `$${totalPending.toFixed(2)}`;
    if (totalCollectedStat) totalCollectedStat.textContent = `$${totalCollected.toFixed(2)}`;

    loginSection.style.display = 'none';
    finesDashboardSection.style.display = 'block';

  } catch (err) {
    console.error('Failed to load fine data', err);
  }
}

// Global function to trigger a fine payment
window.adminMarkFinePaid = async function(issueId, userId, bookId, amount) {
    if (!confirm(`Mark $${amount.toFixed(2)} penalty as paid for this student?`)) return;

    try {
        const res = await fetch('/api/admin/fines/pay', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-session-id': sessionId
            },
            body: JSON.stringify({ issueId, userId, bookId, amount })
        });
        const data = await res.json();
        
        if (res.ok) {
            alert(data.message);
            await fetchFinesData(); // Refresh Tables
        } else {
            alert('Failed: ' + data.message);
        }
    } catch(err) {
        alert('Network error while paying fine.');
    }
}

checkSession();
