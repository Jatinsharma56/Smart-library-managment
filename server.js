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
      bookedByUserId: null
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
    reservedByUserId: null
  },
  {
    id: 'b2',
    title: 'Artificial Intelligence: A Modern Approach',
    author: 'Russell, Norvig',
    availableCopies: 1,
    totalCopies: 3,
    reservedByUserId: null
  },
  {
    id: 'b3',
    title: 'Deep Learning',
    author: 'Goodfellow, Bengio, Courville',
    availableCopies: 0,
    totalCopies: 2,
    reservedByUserId: null
  },
  {
    id: 'b4',
    title: 'Clean Code',
    author: 'Robert C. Martin',
    availableCopies: 4,
    totalCopies: 4,
    reservedByUserId: null
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

  res.status(201).json({
    sessionId,
    user: { id: user.id, name: user.name, email: user.email }
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const user = users.find(
    (u) => u.email.toLowerCase() === String(email).toLowerCase()
  );
  if (!user) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  const ok = await bcrypt.compare(String(password), user.passwordHash);
  if (!ok) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  const sessionId = uuidv4();
  sessions.set(sessionId, { userId: user.id, createdAt: new Date().toISOString() });

  res.json({
    sessionId,
    user: { id: user.id, name: user.name, email: user.email }
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

  res.json({ user: { id: user.id, name: user.name, email: user.email } });
});

// -------- Seat booking --------

function buildSeatMapResponse(zoneId, user) {
  const zone = ZONES.find((z) => z.id === zoneId);
  if (!zone) return null;
  const seats = ensureSeatMap(zone.id);

  const userId = user ? user.id : null;

  return {
    zone: { id: zone.id, name: zone.name, capacity: zone.capacity },
    seats: seats.map((seat) => ({
      seatNumber: seat.seatNumber,
      hasPower: seat.hasPower,
      status: seat.bookedByUserId ? 'booked' : 'free',
      isMine: Boolean(userId && seat.bookedByUserId === userId)
    }))
  };
}

app.get('/api/seats/map', (req, res) => {
  const { zoneId } = req.query;
  if (!zoneId) return res.status(400).json({ message: 'zoneId is required.' });

  const user = findUserBySession(req);
  const payload = buildSeatMapResponse(zoneId, user);
  if (!payload) return res.status(404).json({ message: 'Zone not found.' });

  res.json(payload);
});

app.post('/api/seats/bookSeat', (req, res) => {
  const user = findUserBySession(req);
  if (!user) return res.status(401).json({ message: 'Sign in required to book seats.' });

  const { zoneId, seatNumber } = req.body || {};
  const zone = ZONES.find((z) => z.id === zoneId);
  if (!zone) return res.status(400).json({ message: 'Invalid zone.' });

  const seats = ensureSeatMap(zone.id);
  const seat = seats.find((s) => s.seatNumber === Number(seatNumber));
  if (!seat) return res.status(400).json({ message: 'Invalid seat number.' });

  if (seat.bookedByUserId && seat.bookedByUserId !== user.id) {
    return res.status(409).json({ message: 'Seat already booked.' });
  }

  // Optional rule: one seat per user per zone - clear any existing
  for (const s of seats) {
    if (s.bookedByUserId === user.id) {
      s.bookedByUserId = null;
    }
  }

  seat.bookedByUserId = user.id;

  const payload = buildSeatMapResponse(zone.id, user);
  res.status(201).json({
    message: `Seat ${seat.seatNumber} booked in ${zone.name}.`,
    seatMap: payload
  });
});

app.post('/api/seats/releaseSeat', (req, res) => {
  const user = findUserBySession(req);
  if (!user) return res.status(401).json({ message: 'Sign in required.' });

  const { zoneId, seatNumber } = req.body || {};
  const zone = ZONES.find((z) => z.id === zoneId);
  if (!zone) return res.status(400).json({ message: 'Invalid zone.' });

  const seats = ensureSeatMap(zone.id);
  const seat = seats.find((s) => s.seatNumber === Number(seatNumber));
  if (!seat) return res.status(400).json({ message: 'Invalid seat number.' });

  if (!seat.bookedByUserId || seat.bookedByUserId !== user.id) {
    return res.status(409).json({ message: 'You do not hold this seat.' });
  }

  seat.bookedByUserId = null;

  const payload = buildSeatMapResponse(zone.id, user);
  res.status(200).json({
    message: `Seat ${seat.seatNumber} released.`,
    seatMap: payload
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
      isReservable: b.availableCopies > 0
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

  book.availableCopies -= 1;
  book.reservedByUserId = user.id;

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

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Library Insights Hub running on http://localhost:${PORT}`);
});

