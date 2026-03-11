<<<<<<< HEAD
# Library Insights Hub

AI-powered dashboard showing real-time library seat availability, per-zone crowd levels, and short-term crowding forecasts in a clean, responsive UI.

## Features

- **Live status**: View total capacity, currently available seats, and overall crowd level.
- **Per-zone insights**: See occupancy and availability for each zone (silent, collaborative, computer lab, reading room).
- **AI-style forecast**: Simple heuristic that predicts whether the library is likely to get busier or quieter over the next ~30 minutes based on time-of-day, day-of-week, and current occupancy.
- **Filters & sorting**: Sort zones by busiest/quietest or name, and filter by crowd level (quiet, moderate, busy).
- **Responsive design**: Optimized for mobile and desktop so students can check the library status before traveling.

> Note: This project uses simulated data to demonstrate the experience. You can later plug in real sensor / gate-counter data on the backend.

## Getting started

### 1. Install dependencies

From the project root:

```bash
npm install
```

This installs the small Node.js backend (Express + CORS).

### 2. Run the app

```bash
npm start
```

Then open `http://localhost:3000` in your browser.

The dashboard will:

- Hit `GET /api/status` every 10 seconds to get a fresh snapshot.
- Render overall stats and per-zone cards.
- Show AI insight and a visual crowd bar.

## Project structure

- **`server.js`**: Express server exposing `/api/status` and serving the static frontend.
- **`public/index.html`**: Main page containing the layout and containers.
- **`public/styles.css`**: Modern dark-mode, glassmorphism-inspired dashboard styling.
- **`public/app.js`**: Frontend logic to fetch live data, render cards, and manage filters/auto-refresh.

## Data model

`GET /api/status` returns JSON like:

```json
{
  "generatedAt": "2026-03-10T10:15:23.123Z",
  "total": {
    "capacity": 230,
    "occupied": 162,
    "available": 68,
    "occupancyRatio": 0.7,
    "crowdLabel": "Busy"
  },
  "zones": [
    {
      "id": "silent",
      "name": "Silent Study Zone",
      "capacity": 80,
      "occupied": 70,
      "available": 10,
      "occupancyRatio": 0.875
    }
  ],
  "aiInsight": {
    "forecastMinutesAhead": 30,
    "forecastOccupancyRatio": 0.76,
    "forecastLabel": "Likely to get busier"
  }
}
```

The "AI" forecast uses a lightweight heuristic combining:

- Time of day (peak vs off-peak)
- Day type (weekday vs weekend)
- Current occupancy level

You can later replace this with a proper ML model informed by historical data.

## Next steps / Extension ideas

- **Real sensors**: Integrate real turnstile or seat-sensor data into `generateSeatSnapshot`.
- **User-specific recommendations**: Suggest the quietest zone that still has seats, or alert when the library is near capacity.
- **Weekly patterns**: Add charts showing hourly average occupancy by weekday.
- **Notifications**: Allow subscribing for alerts when the library becomes quiet enough or drops below a threshold.

=======
# Smart-library-managment
>>>>>>> ee51345550fc210f2d4ae6dbbc2d37fe93bc64e1
