# Frontend React Dashboard

🖥️ **Component 7** — Real-time Monitoring Dashboard

## Overview

The React frontend provides a real-time dashboard for:
- **Event Streaming**: View all incoming IoT events
- **Alert Monitoring**: Display detected complex events
- **Pattern Management**: Manage CEP detection rules
- **Analytics**: Trend analysis and statistics

## Architecture

```
React SPA (React 18)
     │
     ├─ Dashboard Tab (Overview)
     ├─ Alerts Tab (Complex Events)
     ├─ Events Tab (Raw Events)
     └─ Patterns Tab (CEP Rules)
          │
          ▼
    API Backend (Flask)
```

## Features

### 1. Dashboard Tab
- **Summary Stats**: Event count, alert count, pattern count
- **Real-time Chart**: Events per minute (line chart)
- **Recent Alerts**: Last 5 complex events

### 2. Alerts Tab
- **Active Alerts**: All triggered CEP patterns
- **Severity Color-coding**: Critical (red), High (orange), Medium (yellow), Low (green)
- **Source Events**: Links to events that triggered the alert
- **Auto-refresh**: Updates every 5 seconds

### 3. Events Tab
- **Event Stream**: All recent events from simulator
- **Filtering**: By domain, zone, severity
- **Event Details**: Full event data with metadata

### 4. Patterns Tab
- **Pattern List**: All configured CEP rules
- **Pattern Status**: Enabled/disabled indicator
- **Pattern Rules**: EPL query preview
- **Input Domains**: Domains required for pattern

## Components

### Main Component: `App.js`
- Tab navigation
- Data fetching via Axios
- State management with React hooks

### Subcomponents (expandable):
- `EventList.js` — Event list UI
- `AlertList.js` — Alert/complex event list
- `PatternManager.js` — Pattern editor
- `Dashboard.js` — Summary statistics and charts

## Configuration

### Environment Variables

```bash
# .env.local
REACT_APP_API_URL=http://localhost:5000/api
```

### Running Locally

```bash
npm install
npm start
```

Visit: http://localhost:3000

## API Integration

### Endpoints Used

```javascript
// Events
GET /api/events?limit=50
GET /api/events/{event_id}

// Complex Events
GET /api/events/complex?limit=50

// Patterns
GET /api/patterns
POST /api/patterns
PUT /api/patterns/{pattern_id}
DELETE /api/patterns/{pattern_id}

// Statistics
GET /api/stats/events-per-minute
GET /api/stats/top-alerts
GET /api/stats/zones/{zone}
```

## Styling

- Color Scheme: Dark blue (#1a3a52) and accent colors
- Responsive Grid Layout
- Severity-based color coding
- Card-based UI components

### Severity Colors
- 🔴 Critical: #ff4444 (red)
- 🟠 High: #ff9800 (orange)
- 🟡 Medium: #ffc107 (yellow)
- 🟢 Low: #4caf50 (green)

## Building for Production

```bash
# Create optimized production build
npm run build

# Output: build/ folder
# Served by Nginx in Docker
```

### Build Optimization
- Minified JavaScript
- Code splitting
- Lazy loading
- Asset compression

## Docker Deployment

```bash
# Build image
docker build -t ucis-frontend:1.0 .

# Run container
docker run -d \
  -p 3000:80 \
  -e REACT_APP_API_URL=http://api:5000/api \
  ucis-frontend:1.0
```

## Performance Optimization

1. **Auto-refresh**: Data updates every 5 seconds
2. **Pagination**: Events list limited to 50 items
3. **Caching**: Browser caches static assets (1 year)
4. **Lazy Loading**: Code-split components
5. **Chart Memoization**: Prevent unnecessary re-renders

## Future Enhancements

- [ ] Real-time WebSocket updates (vs. polling)
- [ ] Map visualization (Leaflet integration)
- [ ] Event search and advanced filtering
- [ ] Pattern editor with visual builder
- [ ] User authentication & authorization
- [ ] Export data to CSV/PDF
- [ ] Custom dashboards per user
- [ ] Mobile-responsive design improvements
- [ ] Dark mode theme
- [ ] Notification system

## Troubleshooting

### Issue: API not connecting
- Verify `REACT_APP_API_URL` in `.env.local`
- Check backend is running on correct port
- Ensure CORS is enabled on backend

### Issue: Charts not displaying
- Check Recharts library is installed
- Verify data is returned from API
- Check browser console for errors

### Issue: Slow performance
- Reduce auto-refresh interval (currently 5s)
- Implement pagination
- Use React DevTools Profiler

## Dependencies

- **React 18**: UI framework
- **Axios**: HTTP client
- **Recharts**: Charting library
- **Leaflet**: Map visualization (future)
- **React Scripts**: Build tooling

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## See Also

- [React Documentation](https://react.dev/)
- [Recharts Documentation](https://recharts.org/)
- [Axios Documentation](https://axios-http.com/)
