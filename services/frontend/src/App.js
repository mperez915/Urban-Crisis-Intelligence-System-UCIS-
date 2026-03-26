import axios from 'axios';
import { useEffect, useState } from 'react';
import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis, YAxis
} from 'recharts';
import './index.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [events, setEvents] = useState([]);
  const [complexEvents, setComplexEvents] = useState([]);
  const [patterns, setPatterns] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch data on component mount and tab change
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'events') {
        const res = await axios.get(`${API_URL}/events?limit=50`);
        setEvents(res.data.events || []);
      } else if (activeTab === 'alerts') {
        const res = await axios.get(`${API_URL}/events/complex?limit=50`);
        setComplexEvents(res.data.events || []);
      } else if (activeTab === 'patterns') {
        const res = await axios.get(`${API_URL}/patterns`);
        setPatterns(res.data.patterns || []);
      } else if (activeTab === 'dashboard') {
        const eventRes = await axios.get(`${API_URL}/events?limit=10`);
        const alertRes = await axios.get(`${API_URL}/events/complex?limit=10`);
        const statsRes = await axios.get(`${API_URL}/stats/events-per-minute`);
        
        setEvents(eventRes.data.events || []);
        setComplexEvents(alertRes.data.events || []);
        setStats(statsRes.data || {});
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch data');
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical':
        return '#ff4444';
      case 'high':
        return '#ff9800';
      case 'medium':
        return '#ffc107';
      case 'low':
        return '#4caf50';
      default:
        return '#999';
    }
  };

  const getDomainIcon = (domain) => {
    const icons = {
      climate: '🌤️',
      traffic: '🚗',
      health: '🏥',
      environment: '🌍',
      population: '👥'
    };
    return icons[domain] || '📍';
  };

  return (
    <div className="app">
      <div className="header">
        <h1>🚨 Urban Crisis Intelligence System (UCIS)</h1>
        <p>Real-time Crisis Detection & Monitoring Dashboard</p>
      </div>

      <div className="container">
        {error && <div className="error">Error: {error}</div>}

        <div className="tab-navigation">
          <button 
            className={`tab-button ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            📊 Dashboard
          </button>
          <button 
            className={`tab-button ${activeTab === 'alerts' ? 'active' : ''}`}
            onClick={() => setActiveTab('alerts')}
          >
            🚨 Alerts ({complexEvents.length})
          </button>
          <button 
            className={`tab-button ${activeTab === 'events' ? 'active' : ''}`}
            onClick={() => setActiveTab('events')}
          >
            📋 Events ({events.length})
          </button>
          <button 
            className={`tab-button ${activeTab === 'patterns' ? 'active' : ''}`}
            onClick={() => setActiveTab('patterns')}
          >
            ⚙️ Patterns ({patterns.length})
          </button>
        </div>

        {loading && <div className="loading">Loading...</div>}

        {activeTab === 'dashboard' && (
          <div>
            <div className="grid">
              <div className="stat-box">
                <div className="stat-number">{events.length}</div>
                <div className="stat-label">Recent Events</div>
              </div>
              <div className="stat-box">
                <div className="stat-number" style={{ color: '#ff4444' }}>
                  {complexEvents.length}
                </div>
                <div className="stat-label">Active Alerts</div>
              </div>
              <div className="stat-box">
                <div className="stat-number" style={{ color: '#ff9800' }}>
                  {patterns.length}
                </div>
                <div className="stat-label">Patterns</div>
              </div>
            </div>

            {stats.data && (
              <div className="card">
                <h3>Events Per Minute (Last Hour)</h3>
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats.data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="_id" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="count" stroke="#1a3a52" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="card">
              <h3>Recent Alerts</h3>
              {complexEvents.slice(0, 5).length > 0 ? (
                <ul className="event-list">
                  {complexEvents.slice(0, 5).map((alert, idx) => (
                    <li key={idx} className={`event-item ${alert.alert_level}`}>
                      <strong>{alert.pattern_id}</strong>
                      <p>{alert.description || 'Alert detected'}</p>
                      <small>{new Date(alert.timestamp).toLocaleString()}</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No active alerts</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'events' && (
          <div className="card">
            <h3>Recent Events</h3>
            {events.length > 0 ? (
              <ul className="event-list">
                {events.map((event, idx) => (
                  <li key={idx} className={`event-item ${event.severity}`}>
                    <div>
                      <strong>
                        {getDomainIcon(event.domain)} {event.domain} - {event.type}
                      </strong>
                      <span style={{ 
                        marginLeft: '10px',
                        padding: '4px 8px',
                        backgroundColor: getSeverityColor(event.severity),
                        color: 'white',
                        borderRadius: '4px',
                        fontSize: '12px'
                      }}>
                        {event.severity}
                      </span>
                    </div>
                    <p>Zone: {event.zone}</p>
                    <small>{new Date(event.timestamp).toLocaleString()}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No events yet</p>
            )}
          </div>
        )}

        {activeTab === 'alerts' && (
          <div className="card">
            <h3>Complex Events & Alerts</h3>
            {complexEvents.length > 0 ? (
              <ul className="event-list">
                {complexEvents.map((alert, idx) => (
                  <li key={idx} className={`event-item ${alert.alert_level}`}>
                    <div>
                      <strong>🚨 {alert.pattern_id}</strong>
                      <span style={{
                        marginLeft: '10px',
                        padding: '4px 8px',
                        backgroundColor: getSeverityColor(alert.alert_level),
                        color: 'white',
                        borderRadius: '4px',
                        fontSize: '12px'
                      }}>
                        {alert.alert_level}
                      </span>
                    </div>
                    <p>{alert.description || 'Complex event detected'}</p>
                    <p>Source Events: {alert.source_events?.length || 0}</p>
                    <small>{new Date(alert.timestamp).toLocaleString()}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No active alerts</p>
            )}
          </div>
        )}

        {activeTab === 'patterns' && (
          <div className="card">
            <h3>CEP Patterns</h3>
            {patterns.length > 0 ? (
              <div>
                {patterns.map((pattern, idx) => (
                  <div key={idx} style={{
                    marginBottom: '15px',
                    padding: '15px',
                    backgroundColor: '#f9f9f9',
                    borderRadius: '4px',
                    borderLeft: `4px solid ${getSeverityColor(pattern.severity)}`
                  }}>
                    <h4>{pattern.name || pattern.pattern_id}</h4>
                    <p><strong>Status:</strong> {pattern.enabled ? '✅ Enabled' : '❌ Disabled'}</p>
                    <p><strong>Severity:</strong> {pattern.severity}</p>
                    <p><strong>Rule:</strong> <code style={{ fontSize: '12px' }}>{pattern.epl_rule?.substring(0, 100)}...</code></p>
                    {pattern.input_domains && (
                      <p><strong>Domains:</strong> {pattern.input_domains.join(', ')}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p>No patterns configured</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
