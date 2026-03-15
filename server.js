const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// Simulated Email Service
function sendSimulatedEmail(to, subject, body) {
  console.log('\n======================================================');
  console.log('📧 SIMULATED EMAIL SENT');
  console.log(`To:      ${to}`);
  console.log(`Subject: ${subject}`);
  console.log('------------------------------------------------------');
  console.log(body);
  console.log('======================================================\n');
}

// Global Library Settings
const librarySettings = {
  // Library Settings
  branchSelector: 'All Branches',
  maxBooksPerStudent: 2,
  seatBookingTimeLimit: 120, // in minutes
  
  // Notification Settings
  emailAlerts: true,
  dueDateReminders: true,
  newBookAlerts: false
};

// In-memory data stores (demo only, resets on restart)
const users = [
  { id: 'u3', name: 'John Doe', email: 'john@library.com', password: '123' } // Dummy user for fines
];
const sessions = new Map(); // sessionId -> { userId, createdAt }

const activeIssues = [
  {
    id: 'i1',
    bookId: 'b1',
    userId: 'u3',
    issuedDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(), 
    dueDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString()
  }
];

const fines = [
  {
    id: 'f1',
    userId: 'u3',
    bookId: 'b1',
    amount: 5,
    status: 'pending',
    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  }
];

const SEATS_PER_ZONE = 50;

const ZONES = [
  { id: 'silent', name: 'Silent Study Zone', capacity: SEATS_PER_ZONE },
  { id: 'collab', name: 'Collaborative Zone', capacity: SEATS_PER_ZONE },
  { id: 'computers', name: 'Computer Lab', capacity: SEATS_PER_ZONE },
  { id: 'reading', name: 'Reading Room', capacity: SEATS_PER_ZONE }
];

// Track per-seat bookings so we can render a seat map
// zoneId -> [{ seatNumber, hasPower, bookedByUserId | null }]
const zoneSeatMaps = new Map();

function ensureSeatMap(zoneId) {
  if (zoneSeatMaps.has(zoneId)) return zoneSeatMaps.get(zoneId);

  const seats = [];
  for (let i = 1; i <= SEATS_PER_ZONE; i += 1) {
    seats.push({
      seatNumber: i,
      hasPower: i % 5 === 0,
      bookings: [] // Array of { userId, slot, bookedAt, isCheckedIn }
    });
  }
  zoneSeatMaps.set(zoneId, seats);
  return seats;
}

// Simple demo book catalogue
const books = [
  {
    id: 'b1',
    title: 'Introduction to Algorithms',
    author: 'Cormen, Leiserson, Rivest, Stein',
    department: 'BE CSE',
    section: 'Core Modules',
    availableCopies: 2,
    totalCopies: 5,
    reservedByUserIds: [],
    issuedByUserIds: ['u3']
  },
  {
    id: 'b2',
    title: 'Artificial Intelligence: A Modern Approach',
    author: 'Russell, Norvig',
    department: 'BE CSE',
    section: 'Electives',
    availableCopies: 1,
    totalCopies: 3,
    reservedByUserIds: [],
    issuedByUserIds: []
  },
  {
    id: 'b3',
    title: 'Deep Learning',
    author: 'Goodfellow, Bengio, Courville',
    department: 'BE CSE',
    section: 'Electives',
    availableCopies: 0,
    totalCopies: 2,
    reservedByUserIds: [],
    issuedByUserIds: []
  },
  {
    id: 'b4',
    title: 'Clean Code',
    author: 'Robert C. Martin',
    department: 'BE CSE',
    section: 'Foundation',
    availableCopies: 4,
    totalCopies: 4,
    reservedByUserIds: [],
    issuedByUserIds: []
  },
  {
    id: 'b5',
    title: 'Pharmacy Practice and The Law',
    author: 'Richard R. Abood',
    department: 'B Pharmacy',
    section: 'Law & Ethics',
    availableCopies: 5,
    totalCopies: 8,
    reservedByUserIds: [],
    issuedByUserIds: []
  },
  {
    id: 'b6',
    title: 'Pharmacology',
    author: 'Lippincott Williams & Wilkins',
    department: 'B Pharmacy',
    section: 'Core Subjects',
    availableCopies: 2,
    totalCopies: 4,
    reservedByUserIds: [],
    issuedByUserIds: []
  },
  {
    id: 'b7',
    title: 'Data Structures and Algorithms in Java',
    author: 'Michael T. Goodrich, Roberto Tamassia',
    department: 'BCA',
    section: 'Programming',
    availableCopies: 6,
    totalCopies: 6,
    reservedByUserIds: [],
    issuedByUserIds: []
  },
  {
    id: 'b8',
    title: 'Operating System Concepts',
    author: 'Abraham Silberschatz',
    department: 'BCA',
    section: 'Systems',
    availableCopies: 1,
    totalCopies: 5,
    reservedByUserIds: [],
    issuedByUserIds: []
  },
  {
    id: 'b9',
    title: 'Fundamentals of Nursing',
    author: 'Patricia A. Potter',
    department: 'Nursing',
    section: 'First Year',
    availableCopies: 4,
    totalCopies: 7,
    reservedByUserIds: [],
    issuedByUserIds: []
  },
  {
    id: 'b10',
    title: 'Medical-Surgical Nursing',
    author: 'Sharon L. Lewis',
    department: 'Nursing',
    section: 'Second Year',
    availableCopies: 3,
    totalCopies: 6,
    reservedByUserIds: [],
    issuedByUserIds: []
  }
];

function baseDemandFactor(hour) {
  if (hour >= 9 && hour < 12) return 0.7;
  if (hour >= 12 && hour < 15) return 0.9;
  if (hour >= 15 && hour < 18) return 1.0;
  if (hour >= 18 && hour < 21) return 0.8;
  if (hour >= 21 || hour < 8) return 0.3;
  return 0.5;
}

function dayOfWeekFactor(day) {
  if (day === 0) return 0.4;
  if (day === 6) return 0.6;
  return 1.0;
}

function getZoneBias(zoneId) {
  switch (zoneId) {
    case 'silent':
      return 1.0;
    case 'collab':
      return 0.9;
    case 'computers':
      return 0.8;
    case 'reading':
      return 0.7;
    default:
      return 0.8;
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function generateSeatSnapshot() {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();

  let totalCapacity = 0;
  let totalOccupied = 0;
  const zones = [];

  for (const zone of ZONES) {
    const seatMap = ensureSeatMap(zone.id);
    const occupied = seatMap.filter((s) => s.bookedByUserId).length;
    const available = zone.capacity - occupied;

    totalCapacity += zone.capacity;
    totalOccupied += occupied;

    zones.push({
      id: zone.id,
      name: zone.name,
      capacity: zone.capacity,
      occupied,
      available,
      occupancyRatio: occupied / zone.capacity
    });
  }

  const globalOccupancyRatio = totalOccupied / totalCapacity;

  const { currentInsight, horizon } = generateCrowdForecast(globalOccupancyRatio);

  let crowdLabel;
  if (globalOccupancyRatio >= 0.85) crowdLabel = 'Very busy';
  else if (globalOccupancyRatio >= 0.65) crowdLabel = 'Busy';
  else if (globalOccupancyRatio >= 0.4) crowdLabel = 'Moderate';
  else crowdLabel = 'Quiet';

  return {
    generatedAt: now.toISOString(),
    total: {
      capacity: totalCapacity,
      occupied: totalOccupied,
      available: totalCapacity - totalOccupied,
      occupancyRatio: globalOccupancyRatio,
      crowdLabel
    },
    zones,
    aiInsight: {
      forecastMinutesAhead: horizon.forecastMinutesAhead,
      forecastOccupancyRatio: horizon.points[0].predictedOccupancyRatio,
      forecastLabel: currentInsight.label,
      horizons: horizon.points
    }
  };
}

function generateCrowdForecast(currentRatio) {
  const baseChange = (Math.random() - 0.5) * 0.06;

  const trendBias =
    (currentRatio > 0.85 ? 0.03 : 0) -
    (currentRatio < 0.4 ? 0.03 : 0);

  const points = [15, 30, 60].map((minutesAhead, index) => {
    const noise = (Math.random() - 0.5) * 0.05;
    const stepMultiplier = 1 + index * 0.6;

    const delta = clamp(
      (baseChange + trendBias) * stepMultiplier + noise,
      -0.18,
      0.18
    );

    const predicted = clamp(currentRatio + delta, 0.05, 0.98);

    let label;
    if (predicted >= 0.85) label = 'Very busy';
    else if (predicted >= 0.65) label = 'Busy';
    else if (predicted >= 0.4) label = 'Moderate';
    else label = 'Quiet';

    return {
      minutesAhead,
      predictedOccupancyRatio: predicted,
      label
    };
  });

  const first = points[0];
  let overallLabel;
  if (first.predictedOccupancyRatio > currentRatio + 0.05) {
    overallLabel = 'Likely to get busier';
  } else if (first.predictedOccupancyRatio < currentRatio - 0.05) {
    overallLabel = 'Likely to get quieter';
  } else {
    overallLabel = 'Expected to stay similar';
  }

  return {
    currentInsight: {
      label: overallLabel,
      baselineOccupancyRatio: currentRatio
    },
    horizon: {
      forecastMinutesAhead: 60,
      points
    }
  };
}

function findUserBySession(req) {
  const sessionId = req.header('x-session-id');
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session) return null;
  const user = users.find((u) => u.id === session.userId);
  return user || null;
}

// -------- Auth endpoints (demo) --------

app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email and password are required.' });
  }

  const existing = users.find(
    (u) => u.email.toLowerCase() === String(email).toLowerCase()
  );
  if (existing) {
    return res.status(409).json({ message: 'An account with that email already exists.' });
  }

  const passwordHash = await bcrypt.hash(String(password), 8);
  const user = {
    id: uuidv4(),
    name: String(name),
    email: String(email).toLowerCase(),
    passwordHash
  };
  users.push(user);

  const sessionId = uuidv4();
  sessions.set(sessionId, { userId: user.id, createdAt: new Date().toISOString() });

  // Send Welcome Email
  sendSimulatedEmail(
    user.email,
    'Welcome to Library Insights Hub!',
    `Hi ${user.name},\n\nThanks for signing up. You can now book seats and reserve books from the dashboard.\n\nHappy studying!`
  );

  res.status(201).json({
    sessionId,
    user: { id: user.id, name: user.name, email: user.email, isAdmin: !!user.isAdmin }
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password required.' });
  }

  const normalizedEmail = String(email).toLowerCase();

  // Hardcode an admin entry if it doesn't exist
  if (normalizedEmail === 'admin@library.com') {
    let adminUser = users.find((u) => u.email === normalizedEmail);
    if (!adminUser) {
      const hashed = await bcrypt.hash('admin123', 10);
      adminUser = {
        id: uuidv4(),
        name: 'Administrator',
        email: normalizedEmail,
        passwordHash: hashed,
        isAdmin: true
        // NOTE: admin123 is the password
      };
      users.push(adminUser);
    }
  }

  let user = users.find((u) => u.email === normalizedEmail);
  if (!user) {
    const passwordHash = await bcrypt.hash(String(password), 8);
    const name = String(email).split('@')[0];
    user = {
      id: uuidv4(),
      name: name,
      email: normalizedEmail,
      passwordHash
    };
    users.push(user);

    sendSimulatedEmail(
      user.email,
      'Welcome to Library Insights Hub!',
      `Hi ${user.name},\n\nThanks for signing up. You can now book seats and reserve books from the dashboard.\n\nHappy studying!`
    );
  } else {
    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }
  }

  const sessionId = uuidv4();
  sessions.set(sessionId, { userId: user.id, createdAt: new Date().toISOString() });

  res.json({
    sessionId,
    user: { id: user.id, name: user.name, email: user.email, isAdmin: !!user.isAdmin }
  });
});

app.post('/api/auth/logout', (req, res) => {
  const sessionId = req.header('x-session-id');
  if (sessionId) {
    sessions.delete(sessionId);
  }
  res.status(204).end();
});

app.get('/api/auth/me', (req, res) => {
  const user = findUserBySession(req);
  if (!user) return res.status(401).json({ message: 'Not signed in.' });

  res.json({ user: { id: user.id, name: user.name, email: user.email, isAdmin: !!user.isAdmin } });
});

// -------- Seat booking --------

function buildSeatMapResponse(zoneId, user, slot) {
  const zone = ZONES.find((z) => z.id === zoneId);
  if (!zone) return null;
  const seats = ensureSeatMap(zone.id);

  const userId = user ? user.id : null;

  return {
    zone: { id: zone.id, name: zone.name, capacity: zone.capacity },
    seats: seats.map((seat) => {
      // Find booking for the requested slot
      const booking = seat.bookings.find(b => !slot || b.slot === slot);
      
      return {
        seatNumber: seat.seatNumber,
        hasPower: seat.hasPower,
        status: booking ? 'booked' : 'free',
        isMine: Boolean(userId && booking && booking.userId === userId),
        bookedAt: booking ? booking.bookedAt : null,
        isCheckedIn: booking ? booking.isCheckedIn : false
      };
    })
  };
}

app.get('/api/seats/map', (req, res) => {
  const { zoneId, slot } = req.query;
  if (!zoneId) return res.status(400).json({ message: 'zoneId is required.' });

  const user = findUserBySession(req);
  const payload = buildSeatMapResponse(zoneId, user, slot);
  if (!payload) return res.status(404).json({ message: 'Zone not found.' });

  res.json(payload);
});

app.post('/api/seats/bookSeat', (req, res) => {
  let user = findUserBySession(req);
  if (!user) {
    user = { id: 'guest_user', name: 'Guest User', email: 'guest@library.com' };
  }

  const { zoneId, seatNumber, slot } = req.body || {};
  if (!slot) return res.status(400).json({ message: 'Time slot is required.' });
  
  const zone = ZONES.find((z) => z.id === zoneId);
  if (!zone) return res.status(400).json({ message: 'Invalid zone.' });

  const seats = ensureSeatMap(zone.id);
  const seat = seats.find((s) => s.seatNumber === Number(seatNumber));
  if (!seat) return res.status(400).json({ message: 'Invalid seat number.' });

  // Check if seat is already booked for this slot
  const existingBooking = seat.bookings.find(b => b.slot === slot);
  if (existingBooking) {
    if (existingBooking.userId === user.id) {
      return res.status(409).json({ message: 'You already booked this seat for this time.' });
    }
    return res.status(409).json({ message: 'Seat already booked for this time.' });
  }

  // Count existing bookings for this user in this slot
  let userBookingCount = 0;
  for (const z of ZONES) {
    const zSeats = zoneSeatMaps.get(z.id) || [];
    for (const s of zSeats) {
       if (s.bookings.some(b => b.userId === user.id && b.slot === slot)) {
          userBookingCount++;
       }
    }
  }

  if (user.id !== 'guest_user') {
    if (userBookingCount >= 2) {
      return res.status(409).json({ message: 'You can only book up to 2 seats per time slot across all library zones.' });
    }
  }

  seat.bookings.push({
    userId: user.id,
    slot,
    bookedAt: Date.now(),
    isCheckedIn: false
  });

  // Send Booking Email
  sendSimulatedEmail(
    user.email,
    'Seat Booking Confirmed',
    `Hi ${user.name},\n\nYou have successfully booked Seat ${seat.seatNumber} in the ${zone.name} for the time slot ${slot}.\n\nYou have 20 minutes from the start of the booking to check in at the library or your seat will be automatically released.\n\nEnjoy!`
  );

  const payload = buildSeatMapResponse(zone.id, user, slot);
  res.status(201).json({
    message: `Seat ${seat.seatNumber} booked in ${zone.name}.`,
    seatMap: payload
  });
});

app.post('/api/seats/releaseSeat', (req, res) => {
  return res.status(403).json({ message: 'Only administrators can modify bookings.' });
});

app.post('/api/seats/adminRelease', (req, res) => {
  const user = findUserBySession(req);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ message: 'Forbidden. Admin access required.' });
  }

  const { zoneId, seatNumber, slot } = req.body || {};
  const zone = ZONES.find((z) => z.id === zoneId);
  if (!zone) return res.status(400).json({ message: 'Invalid zone.' });

  const seats = ensureSeatMap(zone.id);
  const seat = seats.find((s) => s.seatNumber === Number(seatNumber));
  if (!seat) return res.status(400).json({ message: 'Invalid seat number.' });

  const bookingIndex = seat.bookings.findIndex(b => !slot || b.slot === slot);
  if (bookingIndex === -1) {
    return res.status(404).json({ message: 'No booking found for this seat.' });
  }

  // Remove the booking
  seat.bookings.splice(bookingIndex, 1);

  const payload = buildSeatMapResponse(zone.id, user, slot);
  res.status(200).json({
    message: `Seat ${seat.seatNumber} released.`,
    seatMap: payload
  });
});
app.post('/api/seats/checkIn', (req, res) => {
  let user = findUserBySession(req);
  if (!user) {
    user = { id: 'guest_user', name: 'Guest User', email: 'guest@library.com' };
  }

  const { zoneId, seatNumber, slot, userId } = req.body || {};
  if (!zoneId || !seatNumber || !slot) {
    return res.status(400).json({ message: 'Missing check-in data.' });
  }

  const targetUser = (user.isAdmin && userId) ? users.find(u => u.id === userId) : user;
  if (!targetUser) return res.status(404).json({ message: 'User not found.' });

  const zone = ZONES.find((z) => z.id === zoneId);
  if (!zone) return res.status(400).json({ message: 'Invalid zone.' });

  const seats = ensureSeatMap(zone.id);
  const seat = seats.find((s) => s.seatNumber === Number(seatNumber));
  if (!seat) return res.status(400).json({ message: 'Invalid seat number.' });

  const booking = seat.bookings.find(b => b.slot === slot && b.userId === targetUser.id);
  if (!booking) {
    return res.status(404).json({ message: 'Booking not found.' });
  }

  if (booking.isCheckedIn) {
    return res.status(409).json({ message: 'Seat already checked in.' });
  }

  booking.isCheckedIn = true;

  const payload = buildSeatMapResponse(zone.id, user, slot);
  res.status(200).json({
    message: `Successfully checked in to seat ${seat.seatNumber}.`,
    seatMap: payload
  });
});

// Auto-expiry job: Run every minute
const EXPIRY_MS = 20 * 60 * 1000; // 20 minutes
setInterval(() => {
  const now = new Date();
  for (const zone of ZONES) {
    const seats = zoneSeatMaps.get(zone.id) || [];
    for (const seat of seats) {
      // iterate backwards since we may remove elements
      for (let i = seat.bookings.length - 1; i >= 0; i--) {
        const booking = seat.bookings[i];
        if (!booking.isCheckedIn && booking.slot) {
          // Parse the slot start time (e.g., "09:00 - 11:00")
          const startTimeStr = booking.slot.split(' - ')[0];
          if (startTimeStr) {
            const [hours, minutes] = startTimeStr.split(':').map(Number);
            const slotStartTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
            const timeSinceSlotStart = now.getTime() - slotStartTime.getTime();
            
            // If the current time is 20+ mins AFTER the slot has started... auto-release
            if (timeSinceSlotStart > EXPIRY_MS) {
              console.log(`Auto-expiring seat ${seat.seatNumber} in ${zone.name} slot ${booking.slot} for user ${booking.userId}`);
              
              const bookingUser = users.find(u => u.id === booking.userId);
              if (bookingUser) {
                sendSimulatedEmail(
                  bookingUser.email,
                  'Seat Reservation Expired',
                  `Hi ${bookingUser.name},\n\nWe noticed you didn't check in to Seat ${seat.seatNumber} in the ${zone.name} within 20 minutes.\n\nYour reservation for ${booking.slot} has been released so others can study.\n\nBest,\nLibrary Team`
                );
              }

              seat.bookings.splice(i, 1);
            }
          }
        }
      }
    }
  }
}, 60 * 1000);

// -------- Admin Dashboard --------

app.get('/api/admin/data', (req, res) => {
  const user = findUserBySession(req);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ message: 'Forbidden. Admin access required.' });
  }

  // Gather all seats
  const allSeatBookings = [];
  for (const zone of ZONES) {
    const seats = zoneSeatMaps.get(zone.id) || [];
    for (const seat of seats) {
      if (seat.bookings.length > 0) {
        for (const b of seat.bookings) {
          const u = users.find((x) => x.id === b.userId);
          allSeatBookings.push({
            zoneId: zone.id,
            zoneName: zone.name,
            seatNumber: seat.seatNumber,
            slot: b.slot,
            userId: b.userId,
            userName: u ? u.name : 'Unknown User',
            userEmail: u ? u.email : 'Unknown',
            isCheckedIn: b.isCheckedIn
          });
        }
      }
    }
  }

  // Group books by department
  const branches = {};
  for (const b of books) {
    if (!branches[b.department]) {
      branches[b.department] = {
        name: b.department,
        reservedBooks: [],
        issuedBooks: []
      };
    }

    const branch = branches[b.department];

    b.reservedByUserIds.forEach(userId => {
      const u = users.find(x => x.id === userId);
      branch.reservedBooks.push({
        id: b.id,
        title: b.title,
        userId: userId,
        userName: u ? u.name : 'Unknown User',
        userEmail: u ? u.email : 'Unknown'
      });
    });

    b.issuedByUserIds.forEach(userId => {
      const u = users.find(x => x.id === userId);
      branch.issuedBooks.push({
        id: b.id,
        title: b.title,
        userId: userId,
        userName: u ? u.name : 'Unknown User',
        userEmail: u ? u.email : 'Unknown'
      });
    });
  }

  res.json({
    users: users.map(u => ({ id: u.id, name: u.name, email: u.email, isAdmin: !!u.isAdmin })),
    SeatBookings: allSeatBookings,
    branches: Object.values(branches),
    userId: user.id
  });
});

app.get('/api/admin/settings', (req, res) => {
  const user = findUserBySession(req);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ message: 'Forbidden. Admin access required.' });
  }
  res.json(librarySettings);
});

app.post('/api/admin/settings', (req, res) => {
  const user = findUserBySession(req);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ message: 'Forbidden. Admin access required.' });
  }

  const { 
    branchSelector, 
    maxBooksPerStudent, 
    seatBookingTimeLimit,
    emailAlerts,
    dueDateReminders,
    newBookAlerts
  } = req.body || {};

  if (typeof branchSelector === 'string') librarySettings.branchSelector = branchSelector;
  if (typeof maxBooksPerStudent === 'number') librarySettings.maxBooksPerStudent = maxBooksPerStudent;
  if (typeof seatBookingTimeLimit === 'number') librarySettings.seatBookingTimeLimit = seatBookingTimeLimit;
  if (typeof emailAlerts === 'boolean') librarySettings.emailAlerts = emailAlerts;
  if (typeof dueDateReminders === 'boolean') librarySettings.dueDateReminders = dueDateReminders;
  if (typeof newBookAlerts === 'boolean') librarySettings.newBookAlerts = newBookAlerts;

  res.status(200).json({ message: 'Settings updated successfully.', settings: librarySettings });
});

app.put('/api/admin/profile', (req, res) => {
  const user = findUserBySession(req);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ message: 'Forbidden. Admin access required.' });
  }

  const { name, email } = req.body || {};
  
  if (name && typeof name === 'string' && name.trim().length > 0) {
    user.name = name.trim();
  }
  
  // Update email if provided, and if it is not already taken
  if (email && typeof email === 'string' && email.trim().length > 0) {
    const existing = users.find(u => u.email === email.trim() && u.id !== user.id);
    if (existing) {
       return res.status(400).json({ message: 'Email is already in use by another account.' });
    }
    user.email = email.trim();
  }

  res.status(200).json({ message: 'Profile updated successfully.', user: { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin } });
});

app.post('/api/admin/books/issue', (req, res) => {
  const user = findUserBySession(req);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ message: 'Forbidden. Admin access required.' });
  }

  const { bookId, userId } = req.body || {};
  const book = books.find(b => b.id === bookId);

  if (!book) return res.status(404).json({ message: 'Book not found.' });

  const reservedIndex = book.reservedByUserIds.indexOf(userId);
  if (reservedIndex === -1) {
    return res.status(400).json({ message: 'User has not reserved this book.' });
  }

  // Move from reserved to issued
  book.reservedByUserIds.splice(reservedIndex, 1);
  book.issuedByUserIds.push(userId);

  // Send Email
  const u = users.find(x => x.id === userId);
  if (u) {
    sendSimulatedEmail(
      u.email,
      'Book Issued',
      `Hi ${u.name},\n\nYou have successfully picked up "${book.title}". Please return it within 14 days.\n\nHappy reading!`
    );
  }

  // Track issue dates with 10 day dueDate
  const issueRecord = {
    id: Date.now().toString(),
    bookId,
    userId,
    issuedDate: new Date().toISOString(),
    dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
  };
  activeIssues.push(issueRecord);

  res.status(200).json({ message: 'Book successfully issued to user.' });
});

app.post('/api/admin/books/return', (req, res) => {
  const user = findUserBySession(req);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ message: 'Forbidden. Admin access required.' });
  }

  const { bookId, userId } = req.body || {};
  const book = books.find(b => b.id === bookId);

  if (!book) return res.status(404).json({ message: 'Book not found.' });

  const issuedIndex = book.issuedByUserIds.indexOf(userId);
  if (issuedIndex === -1) {
    return res.status(400).json({ message: 'User has not been issued this book.' });
  }

  // Remove from issued
  book.issuedByUserIds.splice(issuedIndex, 1);
  // Increment available copies
  book.availableCopies += 1;

  // Send Email
  const u = users.find(x => x.id === userId);
  if (u) {
    sendSimulatedEmail(
      u.email,
      'Book Returned',
      `Hi ${u.name},\n\nThank you for returning "${book.title}".\n\nHope you enjoyed it!`
    );
  }

  // Remove from active issues
  const issueIndex = activeIssues.findIndex(i => i.bookId === bookId && i.userId === userId);
  if (issueIndex !== -1) {
    activeIssues.splice(issueIndex, 1);
  }

  res.status(200).json({ message: 'Book successfully returned.' });
});

// -------- Fines Management --------

app.get('/api/admin/fines', (req, res) => {
  const user = findUserBySession(req);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ message: 'Forbidden. Admin access required.' });
  }

  const currentOverdue = [];
  const now = new Date();
  
  activeIssues.forEach(issue => {
    const due = new Date(issue.dueDate);
    if (now > due) {
      const diffTime = Math.abs(now - due);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const amount = diffDays * 1; // $1 per day fine
      
      const book = books.find(b => b.id === issue.bookId);
      const u = users.find(x => x.id === issue.userId);

      currentOverdue.push({
        issueId: issue.id,
        userId: issue.userId,
        bookId: issue.bookId,
        bookTitle: book ? book.title : 'Unknown Book',
        userName: u ? u.name : 'Unknown User',
        userEmail: u ? u.email : '',
        dueDate: issue.dueDate,
        overdueDays: diffDays,
        calculatedFine: amount
      });
    }
  });

  const enrichedFines = fines.map(f => {
    const book = books.find(b => b.id === f.bookId);
    const u = users.find(x => x.id === f.userId);
    return {
      ...f,
      bookTitle: book ? book.title : 'Unknown Book',
      userName: u ? u.name : 'Unknown User',
      userEmail: u ? u.email : ''
    };
  });

  res.json({
    overdueBooks: currentOverdue,
    recordedFines: enrichedFines
  });
});

app.post('/api/admin/fines/pay', (req, res) => {
  const user = findUserBySession(req);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ message: 'Forbidden.' });
  }

  const { fineId, issueId, userId, bookId, amount } = req.body;

  if (fineId) {
    const fine = fines.find(f => f.id === fineId);
    if (fine) {
      fine.status = 'paid';
      return res.json({ message: 'Fine marked as paid.' });
    }
    return res.status(404).json({ message: 'Fine not found.' });
  } else if (issueId) {
    // Paying a dynamic fine from an active issue
    fines.push({
      id: 'f_' + Date.now(),
      issueId,
      userId,
      bookId,
      amount,
      status: 'paid',
      date: new Date().toISOString()
    });
    return res.json({ message: 'Fine recorded and marked as paid.' });
  }

  res.status(400).json({ message: 'Invalid fine data.' });
});

// -------- Books & reservations --------

app.get('/api/books', (req, res) => {
  const query = String(req.query.q || '').trim().toLowerCase();

  let result = books;
  if (query) {
    result = books.filter(
      (b) =>
        b.title.toLowerCase().includes(query) ||
        b.author.toLowerCase().includes(query) ||
        b.department.toLowerCase().includes(query) ||
        b.section.toLowerCase().includes(query)
    );
  }

  res.json({
    books: result.map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      department: b.department,
      section: b.section,
      availableCopies: b.availableCopies,
      totalCopies: b.totalCopies,
      isReservable: b.availableCopies > 0,
      reservedByUserIds: b.reservedByUserIds
    }))
  });
});

app.post('/api/books/:id/reserve', (req, res) => {
  let user = findUserBySession(req);
  if (!user) {
    user = { id: 'guest_user', name: 'Guest User', email: 'guest@library.com' };
  }

  const book = books.find((b) => b.id === req.params.id);
  if (!book) return res.status(404).json({ message: 'Book not found.' });

  if (book.availableCopies <= 0) {
    return res.status(409).json({ message: 'No available copies to reserve.' });
  }

  // Ensure a single user cannot reserve two copies of the same book
  if (user.id !== 'guest_user' && book.reservedByUserIds.includes(user.id)) {
    return res.status(409).json({ message: 'You have already reserved a copy of this book.' });
  }

  book.availableCopies -= 1;
  book.reservedByUserIds.push(user.id);

  res.status(201).json({
    message: 'Book reserved successfully. Please collect it from the desk.',
    book: {
      id: book.id,
      title: book.title,
      author: book.author,
      availableCopies: book.availableCopies,
      totalCopies: book.totalCopies
    }
  });
});

app.get('/api/status', (req, res) => {
  const snapshot = generateSeatSnapshot();
  res.json(snapshot);
});

// -------- Analytics --------

app.get('/api/analytics/weekly', (req, res) => {
  // Generate mock historical data for the past 7 days, 8am to 10pm
  const hours = [];
  for (let h = 8; h <= 22; h++) {
    hours.push(`${h}:00`);
  }

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const datasets = [];

  // Generate some realistic-looking curves using our baseDemandFactor
  for (let d = 0; d < days.length; d++) {
    const dayData = [];
    const dayFactor = dayOfWeekFactor(d === 6 ? 0 : d + 1); // map to JS Date getDay (Sun=0)

    for (let h = 8; h <= 22; h++) {
      const base = baseDemandFactor(h) * dayFactor;
      // Add random noise
      const noise = (Math.random() - 0.5) * 0.2;
      const occupancy = clamp(base + noise, 0.1, 0.95);
      // Map to out of total capacity (200 seats for 4 zones)
      dayData.push(Math.round(occupancy * 200));
    }

    datasets.push({
      label: days[d],
      data: dayData
    });
  }

  res.json({
    labels: hours,
    datasets
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Library Insights Hub running on http://localhost:${PORT}`);
});

