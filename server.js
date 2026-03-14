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

// In-memory data stores (demo only, resets on restart)
const users = [];
const sessions = new Map(); // sessionId -> { userId, createdAt }

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
    availableCopies: 3,
    totalCopies: 5,
    reservedByUserIds: []
  },
  {
    id: 'b2',
    title: 'Artificial Intelligence: A Modern Approach',
    author: 'Russell, Norvig',
    availableCopies: 1,
    totalCopies: 3,
    reservedByUserIds: []
  },
  {
    id: 'b3',
    title: 'Deep Learning',
    author: 'Goodfellow, Bengio, Courville',
    availableCopies: 0,
    totalCopies: 2,
    reservedByUserIds: []
  },
  {
    id: 'b4',
    title: 'Clean Code',
    author: 'Robert C. Martin',
    availableCopies: 4,
    totalCopies: 4,
    reservedByUserIds: []
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

  const user = users.find((u) => u.email === normalizedEmail);
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  const ok = await bcrypt.compare(String(password), user.passwordHash);
  if (!ok) {
    return res.status(401).json({ message: 'Invalid email or password.' });
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
  const user = findUserBySession(req);
  if (!user) return res.status(401).json({ message: 'Sign in required to book seats.' });

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

  if (userBookingCount >= 2) {
    return res.status(409).json({ message: 'You can only book up to 2 seats per time slot across all library zones.' });
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
  const user = findUserBySession(req);
  // Ensure the user checking in is an admin
  if (!user || !user.isAdmin) return res.status(403).json({ message: 'Only administrators can check users in.' });

  const { zoneId, seatNumber, slot, userId } = req.body || {};
  const zone = ZONES.find((z) => z.id === zoneId);
  if (!zone) return res.status(400).json({ message: 'Invalid zone.' });

  const seats = ensureSeatMap(zone.id);
  const seat = seats.find((s) => s.seatNumber === Number(seatNumber));
  if (!seat) return res.status(400).json({ message: 'Invalid seat number.' });

  // Use the provided userId to find the booking, as the admin is making the request
  const booking = seat.bookings.find(b => (!slot || b.slot === slot));
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
  const now = Date.now();
  for (const zone of ZONES) {
    const seats = zoneSeatMaps.get(zone.id) || [];
    for (const seat of seats) {
      // iterate backwards since we may remove elements
      for (let i = seat.bookings.length - 1; i >= 0; i--) {
        const booking = seat.bookings[i];
        if (!booking.isCheckedIn && booking.bookedAt) {
          if (now - booking.bookedAt > EXPIRY_MS) {
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

  res.json({
    users: users.map(u => ({ id: u.id, name: u.name, email: u.email, isAdmin: !!u.isAdmin })),
    SeatBookings: allSeatBookings,
    reservedBooks: books.flatMap(b => 
      b.reservedByUserIds.map(userId => {
        const u = users.find((x) => x.id === userId);
        return {
          id: b.id,
          title: b.title,
          userName: u ? u.name : 'Unknown User',
          userEmail: u ? u.email : 'Unknown'
        };
      })
    )
  });
});

// -------- Books & reservations --------

app.get('/api/books', (req, res) => {
  const query = String(req.query.q || '').trim().toLowerCase();

  let result = books;
  if (query) {
    result = books.filter(
      (b) =>
        b.title.toLowerCase().includes(query) ||
        b.author.toLowerCase().includes(query)
    );
  }

  res.json({
    books: result.map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      availableCopies: b.availableCopies,
      totalCopies: b.totalCopies,
      isReservable: b.availableCopies > 0,
      reservedByUserIds: b.reservedByUserIds
    }))
  });
});

app.post('/api/books/:id/reserve', (req, res) => {
  const user = findUserBySession(req);
  if (!user) return res.status(401).json({ message: 'Sign in required to reserve books.' });

  const book = books.find((b) => b.id === req.params.id);
  if (!book) return res.status(404).json({ message: 'Book not found.' });

  if (book.availableCopies <= 0) {
    return res.status(409).json({ message: 'No available copies to reserve.' });
  }

  // Ensure a single user cannot reserve two copies of the same book
  if (book.reservedByUserIds.includes(user.id)) {
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

