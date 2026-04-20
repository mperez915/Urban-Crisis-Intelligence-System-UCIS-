import axios from 'axios';
import { useEffect, useState } from 'react';
import {
    CartesianGrid, Line, LineChart,
    ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import './index.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const EMPTY_PATTERN = {
  pattern_id: '', name: '', description: '',
  epl_rule: '', severity: 'medium', enabled: true, input_domains: [],
};
const SEVERITIES  = ['low', 'medium', 'high', 'critical'];
const ALL_DOMAINS = ['traffic', 'climate', 'health', 'environment', 'population'];
const ALL_ZONES   = ['downtown', 'suburbs', 'industrial', 'residential', 'airport'];

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [events, setEvents]             = useState([]);
  const [complexEvents, setComplexEvents] = useState([]);
  const [patterns, setPatterns]         = useState([]);
  const [stats, setStats]               = useState({});
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);

  // Filters — Events tab
  const [evtDomain,   setEvtDomain]   = useState('');
  const [evtZone,     setEvtZone]     = useState('');
  const [evtSeverity, setEvtSeverity] = useState('');

  // Filters — Alerts tab
  const [altPatternId,  setAltPatternId]  = useState('');
  const [altAlertLevel, setAltAlertLevel] = useState('');

  // Pattern CRUD
  const [patternForm,  setPatternForm]  = useState(null);
  const [formError,    setFormError]    = useState(null);
  const [formLoading,  setFormLoading]  = useState(false);

  // Re-fetch when tab or filters change
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [activeTab, evtDomain, evtZone, evtSeverity, altPatternId, altAlertLevel]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'events') {
        const params = new URLSearchParams({ limit: 100 });
        if (evtDomain)   params.set('domain',   evtDomain);
        if (evtZone)     params.set('zone',      evtZone);
        if (evtSeverity) params.set('severity',  evtSeverity);
        const res = await axios.get(`${API_URL}/events?${params}`);
        setEvents(res.data.events || []);

      } else if (activeTab === 'alerts') {
        const params = new URLSearchParams({ limit: 100 });
        if (altPatternId)  params.set('pattern_id',  altPatternId);
        if (altAlertLevel) params.set('alert_level',  altAlertLevel);
        const res = await axios.get(`${API_URL}/events/complex?${params}`);
        setComplexEvents(res.data.events || []);

      } else if (activeTab === 'patterns') {
        const res = await axios.get(`${API_URL}/patterns`);
        setPatterns(res.data.patterns || []);

      } else if (activeTab === 'dashboard') {
        const [eventRes, alertRes, statsRes, patternsRes] = await Promise.all([
          axios.get(`${API_URL}/events?limit=100`),
          axios.get(`${API_URL}/events/complex?limit=100`),
          axios.get(`${API_URL}/stats/events-per-minute`),
          axios.get(`${API_URL}/patterns`),
        ]);
        setEvents(eventRes.data.events || []);
        setComplexEvents(alertRes.data.events || []);
        setStats(statsRes.data || {});
        setPatterns(patternsRes.data.patterns || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  // ── Pattern CRUD ───────────────────────────────────────────────────────────
  const openNewPattern    = () => { setPatternForm({ ...EMPTY_PATTERN }); setFormError(null); };
  const openEditPattern   = (p) => { setPatternForm({ ...p, input_domains: Array.isArray(p.input_domains) ? p.input_domains : [] }); setFormError(null); };
  const closeForm         = () => { setPatternForm(null); setFormError(null); };
  const handleFormChange  = (f, v) => setPatternForm(prev => ({ ...prev, [f]: v }));
  const toggleDomain      = (d) => setPatternForm(prev => ({
    ...prev,
    input_domains: prev.input_domains.includes(d)
      ? prev.input_domains.filter(x => x !== d)
      : [...prev.input_domains, d],
  }));

  const savePattern = async () => {
    setFormError(null);
    if (!patternForm.pattern_id.trim()) { setFormError('pattern_id is required'); return; }
    if (!patternForm.epl_rule.trim())   { setFormError('EPL rule is required');    return; }
    setFormLoading(true);
    try {
      if (!patternForm._id) {
        await axios.post(`${API_URL}/patterns`, patternForm);
      } else {
        const { _id, ...data } = patternForm;
        await axios.put(`${API_URL}/patterns/${patternForm.pattern_id}`, data);
      }
      closeForm();
      fetchData();
    } catch (err) {
      setFormError(err.response?.data?.error || err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const togglePattern = async (p) => {
    try {
      await axios.put(`${API_URL}/patterns/${p.pattern_id}`, { enabled: !p.enabled });
      fetchData();
    } catch (err) { setError(err.response?.data?.error || err.message); }
  };

  const deletePattern = async (p) => {
    if (!window.confirm(`Delete pattern "${p.name || p.pattern_id}"?`)) return;
    try {
      await axios.delete(`${API_URL}/patterns/${p.pattern_id}`);
      fetchData();
    } catch (err) { setError(err.response?.data?.error || err.message); }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getSeverityColor = (s) =>
    ({ critical: '#ff4444', high: '#ff9800', medium: '#ffc107', low: '#4caf50' }[s] || '#999');

  const getDomainIcon = (d) =>
    ({ climate: '🌤️', traffic: '🚗', health: '🏥', environment: '🌍', population: '👥' }[d] || '📍');

  const FilterBar = ({ children }) => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
      {children}
    </div>
  );

  const Select = ({ value, onChange, placeholder, options }) => (
    <select className="form-input" style={{ width: 'auto', minWidth: 130 }} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  const ClearBtn = ({ onClick }) => (
    <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={onClick}>Clear</button>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      <div className="header">
        <h1>🚨 Urban Crisis Intelligence System (UCIS)</h1>
        <p>Real-time Crisis Detection &amp; Monitoring Dashboard</p>
      </div>

      <div className="container">
        {error && <div className="error">Error: {error}</div>}

        <div className="tab-navigation">
          {[
            { id: 'dashboard', label: '📊 Overview' },
            { id: 'alerts',    label: `🚨 Alerts (${complexEvents.length})` },
            { id: 'events',    label: `📋 Events (${events.length})` },
            { id: 'patterns',  label: `⚙️ Patterns (${patterns.length})` },
          ].map(tab => (
            <button key={tab.id}
              className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>

        {loading && <div className="loading">Loading...</div>}

        {/* ── DASHBOARD ── */}
        {activeTab === 'dashboard' && (
          <div>
            <div className="grid">
              <div className="stat-box">
                <div className="stat-number">{events.length}</div>
                <div className="stat-label">Recent Events</div>
              </div>
              <div className="stat-box">
                <div className="stat-number" style={{ color: '#ff4444' }}>{complexEvents.length}</div>
                <div className="stat-label">Active Alerts</div>
              </div>
              <div className="stat-box">
                <div className="stat-number" style={{ color: '#ff9800' }}>{patterns.length}</div>
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
                      <XAxis dataKey="_id" tick={{ fontSize: 10 }} />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="count" stroke="#1a3a52" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="card">
              <h3>Recent Alerts</h3>
              {complexEvents.length > 0 ? (
                <ul className="event-list">
                  {complexEvents.slice(0, 5).map((alert, idx) => (
                    <li key={idx} className={`event-item ${alert.alert_level}`}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <strong>{alert.pattern_name || alert.pattern_id}</strong>
                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11,
                          backgroundColor: getSeverityColor(alert.alert_level), color: 'white' }}>
                          {alert.alert_level}
                        </span>
                      </div>
                      <p style={{ fontSize: 13, margin: '4px 0' }}>Zone: {alert.zone || '—'}</p>
                      <small>{new Date(alert.timestamp).toLocaleString()}</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ color: '#888' }}>No alerts yet — CEP engine is processing events</p>
              )}
            </div>
          </div>
        )}

        {/* ── EVENTS ── */}
        {activeTab === 'events' && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Recent Events</h3>
              <small style={{ color: '#888' }}>{events.length} shown</small>
            </div>
            <FilterBar>
              <Select value={evtDomain}   onChange={setEvtDomain}   placeholder="All domains"   options={ALL_DOMAINS} />
              <Select value={evtZone}     onChange={setEvtZone}     placeholder="All zones"     options={ALL_ZONES} />
              <Select value={evtSeverity} onChange={setEvtSeverity} placeholder="All severities" options={SEVERITIES} />
              {(evtDomain || evtZone || evtSeverity) &&
                <ClearBtn onClick={() => { setEvtDomain(''); setEvtZone(''); setEvtSeverity(''); }} />}
            </FilterBar>
            {events.length > 0 ? (
              <ul className="event-list">
                {events.map((event, idx) => (
                  <li key={idx} className={`event-item ${event.severity}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>{getDomainIcon(event.domain)} {event.domain} — {event.type}</strong>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11,
                        backgroundColor: getSeverityColor(event.severity), color: 'white' }}>
                        {event.severity}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, margin: '4px 0' }}>Zone: <strong>{event.zone}</strong></p>
                    <small>{new Date(event.timestamp).toLocaleString()}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No events match the current filters</p>
            )}
          </div>
        )}

        {/* ── ALERTS ── */}
        {activeTab === 'alerts' && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Complex Events &amp; Alerts</h3>
              <small style={{ color: '#888' }}>{complexEvents.length} shown</small>
            </div>
            <FilterBar>
              <Select value={altPatternId}  onChange={setAltPatternId}
                placeholder="All patterns"
                options={[...new Set(complexEvents.map(e => e.pattern_id).filter(Boolean))]} />
              <Select value={altAlertLevel} onChange={setAltAlertLevel} placeholder="All levels" options={SEVERITIES} />
              {(altPatternId || altAlertLevel) &&
                <ClearBtn onClick={() => { setAltPatternId(''); setAltAlertLevel(''); }} />}
            </FilterBar>
            {complexEvents.length > 0 ? (
              <ul className="event-list">
                {complexEvents.map((alert, idx) => (
                  <li key={idx} className={`event-item ${alert.alert_level}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>🚨 {alert.pattern_name || alert.pattern_id}</strong>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11,
                        backgroundColor: getSeverityColor(alert.alert_level), color: 'white' }}>
                        {alert.alert_level}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, margin: '4px 0' }}>{alert.description || 'Complex event detected'}</p>
                    <p style={{ fontSize: 13, margin: '2px 0' }}>
                      Zone: <strong>{alert.zone || '—'}</strong>
                      &nbsp;|&nbsp; Pattern: <code style={{ fontSize: 11 }}>{alert.pattern_id}</code>
                    </p>
                    <small>{new Date(alert.timestamp).toLocaleString()}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ color: '#888' }}>No alerts match the current filters</p>
            )}
          </div>
        )}

        {/* ── PATTERNS ── */}
        {activeTab === 'patterns' && (
          <div>
            <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px' }}>
              <h3 style={{ margin: 0 }}>CEP Patterns</h3>
              <button className="btn-primary" onClick={openNewPattern}>+ New Pattern</button>
            </div>

            {patterns.length > 0 ? patterns.map((pattern, idx) => (
              <div key={idx} style={{
                marginBottom: 12, padding: 16, backgroundColor: '#f9f9f9', borderRadius: 4,
                borderLeft: `4px solid ${getSeverityColor(pattern.severity)}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h4 style={{ margin: '0 0 4px' }}>{pattern.name || pattern.pattern_id}</h4>
                    <small style={{ color: '#666' }}>{pattern.pattern_id}</small>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button className={pattern.enabled ? 'btn-warning' : 'btn-success'}
                      onClick={() => togglePattern(pattern)}>
                      {pattern.enabled ? '⏸ Disable' : '▶ Enable'}
                    </button>
                    <button className="btn-secondary" onClick={() => openEditPattern(pattern)}>✏️ Edit</button>
                    <button className="btn-danger"    onClick={() => deletePattern(pattern)}>🗑 Delete</button>
                  </div>
                </div>

                {pattern.description && <p style={{ margin: '8px 0 4px', fontSize: 13 }}>{pattern.description}</p>}

                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, marginTop: 8 }}>
                  <span><strong>Severity:</strong> <span style={{ color: getSeverityColor(pattern.severity) }}>{pattern.severity}</span></span>
                  <span><strong>Status:</strong> {pattern.enabled ? '✅ Enabled' : '❌ Disabled'}</span>
                  {pattern.input_domains?.length > 0 &&
                    <span><strong>Domains:</strong> {pattern.input_domains.map(d => getDomainIcon(d) + ' ' + d).join(', ')}</span>}
                  {pattern.match_count !== undefined &&
                    <span><strong>Matches:</strong> {pattern.match_count}</span>}
                </div>

                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 12, color: '#555' }}>EPL Rule</summary>
                  <pre style={{ fontSize: 11, background: '#eee', padding: 8, borderRadius: 4, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {pattern.epl_rule}
                  </pre>
                </details>
              </div>
            )) : (
              <div className="card"><p>No patterns configured.</p></div>
            )}
          </div>
        )}

        {/* ── PATTERN MODAL ── */}
        {patternForm && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: 'white', borderRadius: 8, padding: 24,
              width: '90%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}>
              <h3 style={{ marginTop: 0 }}>{patternForm._id ? 'Edit Pattern' : 'New Pattern'}</h3>

              {formError && <div className="error" style={{ marginBottom: 12 }}>{formError}</div>}

              <label className="form-label">Pattern ID *</label>
              <input className="form-input" value={patternForm.pattern_id}
                onChange={e => handleFormChange('pattern_id', e.target.value)}
                disabled={!!patternForm._id} placeholder="e.g. high_traffic_congestion" />

              <label className="form-label">Name</label>
              <input className="form-input" value={patternForm.name}
                onChange={e => handleFormChange('name', e.target.value)} placeholder="Human-readable name" />

              <label className="form-label">Description</label>
              <textarea className="form-input" rows={2} value={patternForm.description}
                onChange={e => handleFormChange('description', e.target.value)}
                placeholder="What does this pattern detect?" />

              <label className="form-label">EPL Rule *</label>
              <textarea className="form-input" rows={5} value={patternForm.epl_rule}
                onChange={e => handleFormChange('epl_rule', e.target.value)}
                placeholder="SELECT ... FROM TrafficEvent(...).win:time(5 min) ..."
                style={{ fontFamily: 'monospace', fontSize: 12 }} />

              <label className="form-label">Severity</label>
              <select className="form-input" value={patternForm.severity}
                onChange={e => handleFormChange('severity', e.target.value)}>
                {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>

              <label className="form-label">Input Domains</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {ALL_DOMAINS.map(domain => (
                  <label key={domain} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input type="checkbox"
                      checked={patternForm.input_domains.includes(domain)}
                      onChange={() => toggleDomain(domain)} />
                    {getDomainIcon(domain)} {domain}
                  </label>
                ))}
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer' }}>
                <input type="checkbox" checked={patternForm.enabled}
                  onChange={e => handleFormChange('enabled', e.target.checked)} />
                Enabled (CEP Engine picks up changes on next event)
              </label>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={closeForm} disabled={formLoading}>Cancel</button>
                <button className="btn-primary"   onClick={savePattern} disabled={formLoading}>
                  {formLoading ? 'Saving…' : 'Save Pattern'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
