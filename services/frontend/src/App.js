import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { io } from 'socket.io-client';
import './index.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const WS_URL  = process.env.REACT_APP_WEBSOCKET_URL || 'http://localhost:8083';

const SEVERITIES  = ['low', 'medium', 'high', 'critical'];
const ALL_DOMAINS = ['traffic', 'climate', 'health', 'environment', 'population'];
const ALL_ZONES   = ['downtown', 'suburbs', 'industrial', 'residential', 'airport'];
const PAGE_SIZE   = 50;

const EMPTY_PATTERN = {
  pattern_id: '', name: '', description: '',
  epl_rule: '', severity: 'medium', enabled: true, input_domains: [],
};

const EMPTY_SCENARIO = {
  scenario_id: '', name: '', description: '',
  event_rate: 10, force_severity: '', force_zone: '',
  domain_weights: { traffic: 1, climate: 1, health: 1, environment: 1, population: 1 },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const getSeverityColor = (s) =>
  ({ critical: '#ff4444', high: '#ff9800', medium: '#ffc107', low: '#4caf50' }[s] || '#999');

const getDomainIcon = (d) =>
  ({ climate: '🌤️', traffic: '🚗', health: '🏥', environment: '🌍', population: '👥' }[d] || '📍');

const fmtTime = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
};

// ── Mini components ────────────────────────────────────────────────────────────

const FilterBar = ({ children }) => (
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
    {children}
  </div>
);

const Sel = ({ value, onChange, placeholder, options }) => (
  <select className="form-input" style={{ width: 'auto', minWidth: 130 }}
    value={value} onChange={e => onChange(e.target.value)}>
    <option value="">{placeholder}</option>
    {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
  </select>
);

const ClearBtn = ({ onClick }) => (
  <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={onClick}>
    Clear
  </button>
);

const WsIndicator = ({ connected }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
    fontSize: 12, color: connected ? '#4caf50' : '#aaa' }}>
    <span style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
      backgroundColor: connected ? '#4caf50' : '#aaa' }} />
    {connected ? 'Real-time connected' : 'Connecting…'}
  </span>
);

const SeverityBadge = ({ level, style = {} }) => (
  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11,
    backgroundColor: getSeverityColor(level), color: 'white', ...style }}>
    {level}
  </span>
);

// ── App ────────────────────────────────────────────────────────────────────────

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  // data
  const [events, setEvents]             = useState([]);
  const [eventsCount, setEventsCount]   = useState(0);
  const [eventsSkip, setEventsSkip]     = useState(0);
  const [complexEvents, setComplexEvents] = useState([]);
  const [complexCount, setComplexCount] = useState(0);
  const [complexSkip, setComplexSkip]   = useState(0);
  const [patterns, setPatterns]         = useState([]);
  const [stats, setStats]               = useState({});
  const [topAlerts, setTopAlerts]       = useState([]);

  // scenarios + sim config
  const [scenarios, setScenarios]             = useState([]);
  const [simConfig, setSimConfig]             = useState(null);
  const [scenarioForm, setScenarioForm]       = useState(null);  // null = closed
  const [scenarioFormErr, setScenarioFormErr] = useState(null);
  const [scenarioLoading, setScenarioLoading] = useState(false);

  // ui
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [wsConnected, setWsConnected] = useState(false);

  // filters — Events
  const [evtDomain,   setEvtDomain]   = useState('');
  const [evtZone,     setEvtZone]     = useState('');
  const [evtSeverity, setEvtSeverity] = useState('');

  // filters — Alerts
  const [altPatternId,  setAltPatternId]  = useState('');
  const [altAlertLevel, setAltAlertLevel] = useState('');
  const [altSince,      setAltSince]      = useState('60'); // minutes window

  // Pattern CRUD
  const [patternForm, setPatternForm] = useState(null);
  const [formError,   setFormError]   = useState(null);
  const [formLoading, setFormLoading] = useState(false);

  const socketRef = useRef(null);

  // ── WebSocket ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(WS_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('connect',    () => setWsConnected(true));
    socket.on('disconnect', () => setWsConnected(false));
    socket.on('complex_event', (event) => {
      setComplexEvents(prev => {
        const updated = [event, ...prev];
        return updated.slice(0, 200);
      });
      setComplexCount(prev => prev + 1);
    });
    return () => socket.disconnect();
  }, []);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchDashboard = useCallback(async () => {
    try {
      const [evtRes, alertRes, statsRes, patternsRes, topRes, scenariosRes, simRes] =
        await Promise.all([
          axios.get(`${API_URL}/events?limit=${PAGE_SIZE}&skip=0`),
          axios.get(`${API_URL}/events/complex?limit=${PAGE_SIZE}&skip=0&since=60`),
          axios.get(`${API_URL}/stats/events-per-minute`),
          axios.get(`${API_URL}/patterns`),
          axios.get(`${API_URL}/stats/top-alerts`),
          axios.get(`${API_URL}/scenarios`),
          axios.get(`${API_URL}/simulator/config`),
        ]);
      setEvents(evtRes.data.events || []);
      setEventsCount(evtRes.data.count || 0);
      setEventsSkip(0);
      const fetched = alertRes.data.events || [];
      setComplexEvents(prev => {
        const ids = new Set(fetched.map(e => e._id).filter(Boolean));
        const wsOnly = prev.filter(e => !ids.has(e._id));
        return [...fetched, ...wsOnly].slice(0, 200);
      });
      setComplexCount(alertRes.data.count || 0);
      setComplexSkip(0);
      setStats(statsRes.data || {});
      setPatterns(patternsRes.data.patterns || []);
      setTopAlerts(topRes.data.data || []);
      setScenarios(scenariosRes.data.scenarios || []);
      setSimConfig(simRes.data);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const fetchEvents = useCallback(async (skip = 0) => {
    const params = new URLSearchParams({ limit: PAGE_SIZE, skip });
    if (evtDomain)   params.set('domain',   evtDomain);
    if (evtZone)     params.set('zone',      evtZone);
    if (evtSeverity) params.set('severity',  evtSeverity);
    const res = await axios.get(`${API_URL}/events?${params}`);
    if (skip === 0) {
      setEvents(res.data.events || []);
    } else {
      setEvents(prev => [...prev, ...(res.data.events || [])]);
    }
    setEventsCount(res.data.count || 0);
    setEventsSkip(skip);
  }, [evtDomain, evtZone, evtSeverity]);

  const fetchAlerts = useCallback(async (skip = 0) => {
    const params = new URLSearchParams({ limit: PAGE_SIZE, skip });
    if (altPatternId)  params.set('pattern_id',  altPatternId);
    if (altAlertLevel) params.set('alert_level',  altAlertLevel);
    if (altSince)      params.set('since',        altSince);
    const res = await axios.get(`${API_URL}/events/complex?${params}`);
    const fetched = res.data.events || [];
    if (skip === 0) {
      setComplexEvents(prev => {
        const ids = new Set(fetched.map(e => e._id).filter(Boolean));
        const wsOnly = prev.filter(e => !ids.has(e._id));
        return [...fetched, ...wsOnly].slice(0, 200);
      });
    } else {
      setComplexEvents(prev => [...prev, ...fetched]);
    }
    setComplexCount(res.data.count || 0);
    setComplexSkip(skip);
  }, [altPatternId, altAlertLevel, altSince]);

  const fetchPatterns = useCallback(async () => {
    const res = await axios.get(`${API_URL}/patterns`);
    setPatterns(res.data.patterns || []);
  }, []);

  const fetchScenarios = useCallback(async () => {
    const [scenRes, simRes] = await Promise.all([
      axios.get(`${API_URL}/scenarios`),
      axios.get(`${API_URL}/simulator/config`),
    ]);
    setScenarios(scenRes.data.scenarios || []);
    setSimConfig(simRes.data);
  }, []);

  // polling
  useEffect(() => {
    setLoading(true);
    setError(null);
    const run = async () => {
      try {
        if (activeTab === 'dashboard') await fetchDashboard();
        else if (activeTab === 'events')   await fetchEvents(0);
        else if (activeTab === 'alerts')   await fetchAlerts(0);
        else if (activeTab === 'patterns') await fetchPatterns();
        else if (activeTab === 'scenarios') await fetchScenarios();
      } catch (err) {
        setError(err.message || 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    };
    run();
    const interval = setInterval(run, 5000);
    return () => clearInterval(interval);
  }, [activeTab, fetchDashboard, fetchEvents, fetchAlerts, fetchPatterns, fetchScenarios]);

  // reset pagination when filters change
  useEffect(() => { if (activeTab === 'events') fetchEvents(0).catch(() => {}); },
    [evtDomain, evtZone, evtSeverity]); // eslint-disable-line
  useEffect(() => { if (activeTab === 'alerts') fetchAlerts(0).catch(() => {}); },
    [altPatternId, altAlertLevel, altSince]); // eslint-disable-line

  // ── Pattern CRUD ───────────────────────────────────────────────────────────
  const openNewPattern  = () => { setPatternForm({ ...EMPTY_PATTERN }); setFormError(null); };
  const openEditPattern = (p) => { setPatternForm({ ...p, input_domains: Array.isArray(p.input_domains) ? p.input_domains : [] }); setFormError(null); };
  const closeForm       = () => { setPatternForm(null); setFormError(null); };
  const handleFormChange = (f, v) => setPatternForm(prev => ({ ...prev, [f]: v }));
  const toggleDomain    = (d) => setPatternForm(prev => ({
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
      fetchPatterns();
    } catch (err) {
      setFormError(err.response?.data?.error || err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const togglePattern = async (p) => {
    try {
      await axios.put(`${API_URL}/patterns/${p.pattern_id}`, { enabled: !p.enabled });
      fetchPatterns();
    } catch (err) { setError(err.response?.data?.error || err.message); }
  };

  const deletePattern = async (p) => {
    if (!window.confirm(`Delete pattern "${p.name || p.pattern_id}"?`)) return;
    try {
      await axios.delete(`${API_URL}/patterns/${p.pattern_id}`);
      fetchPatterns();
    } catch (err) { setError(err.response?.data?.error || err.message); }
  };

  // ── Simulator / Scenario actions ───────────────────────────────────────────
  const patchSimConfig = async (patch) => {
    try {
      const res = await axios.put(`${API_URL}/simulator/config`, patch);
      setSimConfig(res.data);
    } catch (err) { setError(err.response?.data?.error || err.message); }
  };

  const activateScenario = async (scenarioId) => {
    try {
      const res = await axios.post(`${API_URL}/scenarios/${scenarioId}/activate`);
      setSimConfig(res.data);
    } catch (err) { setError(err.response?.data?.error || err.message); }
  };

  const cloneScenario = async (s) => {
    const newId = `${s.scenario_id}_copy_${Date.now()}`;
    try {
      await axios.post(`${API_URL}/scenarios/${s.scenario_id}/clone`, {
        new_scenario_id: newId,
        new_name: `${s.name} (copy)`,
      });
      fetchScenarios();
    } catch (err) { setError(err.response?.data?.error || err.message); }
  };

  const deleteScenario = async (s) => {
    if (!window.confirm(`Delete scenario "${s.name}"?`)) return;
    try {
      await axios.delete(`${API_URL}/scenarios/${s.scenario_id}`);
      fetchScenarios();
    } catch (err) { setError(err.response?.data?.error || err.message); }
  };

  // Scenario form
  const openNewScenario  = () => { setScenarioForm({ ...EMPTY_SCENARIO }); setScenarioFormErr(null); };
  const openEditScenario = (s) => { setScenarioForm({ ...s }); setScenarioFormErr(null); };
  const closeScenarioForm = () => { setScenarioForm(null); setScenarioFormErr(null); };

  const saveScenario = async () => {
    setScenarioFormErr(null);
    if (!scenarioForm.scenario_id?.trim()) { setScenarioFormErr('scenario_id is required'); return; }
    if (!scenarioForm.name?.trim())        { setScenarioFormErr('name is required');         return; }
    setScenarioLoading(true);
    try {
      if (!scenarioForm._id) {
        await axios.post(`${API_URL}/scenarios`, scenarioForm);
      } else {
        const { _id, scenario_id, is_preset, created_at, ...data } = scenarioForm;
        await axios.put(`${API_URL}/scenarios/${scenarioForm.scenario_id}`, data);
      }
      closeScenarioForm();
      fetchScenarios();
    } catch (err) {
      setScenarioFormErr(err.response?.data?.error || err.message);
    } finally {
      setScenarioLoading(false);
    }
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  const criticalAlerts   = complexEvents.filter(e => e.alert_level === 'critical').length;
  const enabledPatterns  = patterns.filter(p => p.enabled).length;
  const activeScenarioId = simConfig?.active_scenario_id;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      <div className="header">
        <h1>🚨 Urban Crisis Intelligence System (UCIS)</h1>
        <p>Real-time Crisis Detection &amp; Monitoring Dashboard &nbsp;<WsIndicator connected={wsConnected} /></p>
      </div>

      <div className="container">
        {error && <div className="error">Error: {error}</div>}

        <div className="tab-navigation">
          {[
            { id: 'dashboard',  label: '📊 Overview' },
            { id: 'alerts',     label: `🚨 Alerts (${complexEvents.length})` },
            { id: 'events',     label: `📋 Events (${events.length})` },
            { id: 'patterns',   label: `⚙️ Patterns (${patterns.length})` },
            { id: 'scenarios',  label: '🎬 Simulations' },
          ].map(tab => (
            <button key={tab.id}
              className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>

        {loading && <div className="loading">Loading…</div>}

        {/* ── DASHBOARD ───────────────────────────────────────────────────── */}
        {activeTab === 'dashboard' && (
          <div>
            {/* KPI boxes */}
            <div className="grid">
              <div className="stat-box">
                <div className="stat-number">{eventsCount.toLocaleString()}</div>
                <div className="stat-label">Total Events (DB)</div>
              </div>
              <div className="stat-box">
                <div className="stat-number" style={{ color: '#ff4444' }}>{criticalAlerts}</div>
                <div className="stat-label">Critical Alerts</div>
              </div>
              <div className="stat-box">
                <div className="stat-number" style={{ color: '#ff9800' }}>{complexEvents.length}</div>
                <div className="stat-label">Alerts (session)</div>
              </div>
              <div className="stat-box">
                <div className="stat-number" style={{ color: '#1a3a52' }}>
                  {enabledPatterns}
                  <span style={{ fontSize: 16, fontWeight: 'normal', color: '#888' }}>/{patterns.length}</span>
                </div>
                <div className="stat-label">Active Patterns</div>
              </div>
            </div>

            {/* Simulator status strip */}
            {simConfig && (
              <div className="card" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center',
                gap: 20, flexWrap: 'wrap', background: simConfig.paused ? '#fff8e1' : '#f0f9f0' }}>
                <strong style={{ fontSize: 13 }}>🎬 Simulator</strong>
                <span style={{ fontSize: 13 }}>
                  Scenario: <strong>{activeScenarioId || '—'}</strong>
                </span>
                <span style={{ fontSize: 13 }}>
                  Rate: <strong>{simConfig.event_rate} evt/s</strong>
                </span>
                {simConfig.force_zone && (
                  <span style={{ fontSize: 13 }}>Zone: <strong>{simConfig.force_zone}</strong></span>
                )}
                {simConfig.force_severity && (
                  <SeverityBadge level={simConfig.force_severity} />
                )}
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button className={simConfig.paused ? 'btn-success' : 'btn-warning'}
                    style={{ padding: '4px 12px', fontSize: 12 }}
                    onClick={() => patchSimConfig({ paused: !simConfig.paused })}>
                    {simConfig.paused ? '▶ Resume' : '⏸ Pause'}
                  </button>
                  <button className="btn-secondary"
                    style={{ padding: '4px 12px', fontSize: 12 }}
                    onClick={() => setActiveTab('scenarios')}>
                    Manage →
                  </button>
                </span>
              </div>
            )}

            {/* Events rate chart — adapts to 10s or 1m granularity */}
            <div className="card">
              <h3>{stats.label || 'Event Rate'}</h3>
              {stats.data && stats.data.length > 1 ? (
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats.data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="_id" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis allowDecimals={false} />
                      <Tooltip formatter={val => [val, 'Events']} />
                      <Line type="monotone" dataKey="count" stroke="#1a3a52"
                        dot={stats.data.length < 30} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p style={{ color: '#888', padding: '20px 0' }}>
                  {stats.data
                    ? 'Not enough data points yet — let the simulator run for a few seconds.'
                    : 'Loading chart data…'}
                </p>
              )}
            </div>

            {/* Pattern triggers table */}
            <div className="card">
              <h3>Pattern Trigger Overview</h3>
              {topAlerts.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f0f4f8' }}>
                        {['#', 'Pattern ID', 'Name', 'Severity', 'Triggers'].map((h, i) => (
                          <th key={h} style={{ padding: '10px 12px', borderBottom: '2px solid #ddd',
                            fontWeight: 600, textAlign: i === 4 ? 'right' : 'left' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {topAlerts.map((row, idx) => {
                        const pattern = patterns.find(p => p.pattern_id === row._id);
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '9px 12px', color: '#888' }}>{idx + 1}</td>
                            <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: 11 }}>{row._id}</td>
                            <td style={{ padding: '9px 12px' }}>{pattern?.name || '—'}</td>
                            <td style={{ padding: '9px 12px' }}>
                              {pattern ? <SeverityBadge level={pattern.severity} /> : '—'}
                            </td>
                            <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600 }}>{row.count}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ color: '#888', padding: '12px 0' }}>No pattern triggers recorded yet.</p>
              )}
            </div>

            {/* Events by domain × zone */}
            <div className="card">
              <h3>Events by Domain &amp; Zone <small style={{ fontWeight: 'normal', fontSize: 12, color: '#888' }}>(last {events.length} loaded)</small></h3>
              {events.length > 0 ? (() => {
                const byDomain = {};
                events.forEach(e => {
                  if (!byDomain[e.domain]) byDomain[e.domain] = { total: 0, zones: {} };
                  byDomain[e.domain].total += 1;
                  byDomain[e.domain].zones[e.zone] = (byDomain[e.domain].zones[e.zone] || 0) + 1;
                });
                return (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f0f4f8' }}>
                          <th style={{ padding: '10px 12px', borderBottom: '2px solid #ddd', fontWeight: 600, textAlign: 'left' }}>Domain</th>
                          {ALL_ZONES.map(z => (
                            <th key={z} style={{ padding: '10px 12px', borderBottom: '2px solid #ddd', fontWeight: 600, textAlign: 'right' }}>{z}</th>
                          ))}
                          <th style={{ padding: '10px 12px', borderBottom: '2px solid #ddd', fontWeight: 600, textAlign: 'right' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(byDomain).sort((a, b) => b[1].total - a[1].total).map(([domain, data], idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '9px 12px' }}>{getDomainIcon(domain)} {domain}</td>
                            {ALL_ZONES.map(z => (
                              <td key={z} style={{ padding: '9px 12px', textAlign: 'right',
                                color: data.zones[z] ? '#1a3a52' : '#ccc' }}>
                                {data.zones[z] || '0'}
                              </td>
                            ))}
                            <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600 }}>{data.total}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })() : <p style={{ color: '#888', padding: '12px 0' }}>No event data yet.</p>}
            </div>

            {/* Recent alerts */}
            <div className="card">
              <h3>Recent Alerts <small style={{ fontSize: 12, fontWeight: 'normal', color: '#888' }}>— last hour</small></h3>
              {complexEvents.length > 0 ? (
                <ul className="event-list">
                  {complexEvents.filter(a => {
                    const t = new Date(a.timestamp);
                    return !isNaN(t) && (Date.now() - t.getTime()) < 3600000;
                  }).slice(0, 5).map((alert, idx) => (
                    <li key={idx} className={`event-item ${alert.alert_level}`}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <strong>{alert.pattern_name || alert.pattern_id}</strong>
                        <SeverityBadge level={alert.alert_level} />
                      </div>
                      <p style={{ fontSize: 13, margin: '4px 0' }}>Zone: {alert.zone || '—'}</p>
                      <small>{fmtTime(alert.timestamp)}</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ color: '#888' }}>No alerts yet — CEP engine is processing events</p>
              )}
            </div>
          </div>
        )}

        {/* ── EVENTS ──────────────────────────────────────────────────────── */}
        {activeTab === 'events' && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Recent Events</h3>
              <small style={{ color: '#888' }}>{events.length} shown / {eventsCount.toLocaleString()} total</small>
            </div>
            <FilterBar>
              <Sel value={evtDomain}   onChange={setEvtDomain}   placeholder="All domains"    options={ALL_DOMAINS} />
              <Sel value={evtZone}     onChange={setEvtZone}     placeholder="All zones"      options={ALL_ZONES} />
              <Sel value={evtSeverity} onChange={setEvtSeverity} placeholder="All severities" options={SEVERITIES} />
              {(evtDomain || evtZone || evtSeverity) &&
                <ClearBtn onClick={() => { setEvtDomain(''); setEvtZone(''); setEvtSeverity(''); }} />}
            </FilterBar>
            {events.length > 0 ? (
              <>
                <ul className="event-list">
                  {events.map((event, idx) => (
                    <li key={idx} className={`event-item ${event.severity}`}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong>{getDomainIcon(event.domain)} {event.domain} — {event.type}</strong>
                        <SeverityBadge level={event.severity} />
                      </div>
                      <p style={{ fontSize: 13, margin: '4px 0' }}>Zone: <strong>{event.zone}</strong></p>
                      <small>{fmtTime(event.timestamp)}</small>
                    </li>
                  ))}
                </ul>
                {events.length < eventsCount && (
                  <div style={{ textAlign: 'center', marginTop: 12 }}>
                    <button className="btn-secondary"
                      onClick={() => fetchEvents(eventsSkip + PAGE_SIZE).catch(() => {})}>
                      Load more ({eventsCount - events.length} remaining)
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p>No events match the current filters</p>
            )}
          </div>
        )}

        {/* ── ALERTS ──────────────────────────────────────────────────────── */}
        {activeTab === 'alerts' && (
          <div className="card">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>
                Complex Events &amp; Alerts
                <small style={{ fontWeight: 'normal', fontSize: 12, color: '#888', marginLeft: 8 }}>
                  {complexCount.toLocaleString()} in window · {complexEvents.length} loaded
                </small>
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <WsIndicator connected={wsConnected} />
                <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}
                  onClick={() => setComplexEvents([])}>
                  Clear session
                </button>
              </div>
            </div>

            {/* Filters */}
            <FilterBar>
              <Sel value={altSince} onChange={setAltSince} placeholder="Time window"
                options={[
                  { value: '15',  label: 'Last 15 min' },
                  { value: '60',  label: 'Last hour' },
                  { value: '360', label: 'Last 6 h' },
                  { value: '0',   label: 'All time' },
                ]} />
              <Sel value={altAlertLevel} onChange={setAltAlertLevel} placeholder="All severities" options={SEVERITIES} />
              <Sel value={altPatternId} onChange={setAltPatternId} placeholder="All patterns"
                options={patterns.map(p => ({ value: p.pattern_id, label: p.name || p.pattern_id }))} />
              {(altPatternId || altAlertLevel || altSince !== '60') &&
                <ClearBtn onClick={() => { setAltPatternId(''); setAltAlertLevel(''); setAltSince('60'); }} />}
            </FilterBar>

            {/* Compact table */}
            {complexEvents.length > 0 ? (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f0f4f8', textAlign: 'left' }}>
                        <th style={{ padding: '8px 10px', borderBottom: '2px solid #ddd', fontWeight: 600 }}>Severity</th>
                        <th style={{ padding: '8px 10px', borderBottom: '2px solid #ddd', fontWeight: 600 }}>Pattern</th>
                        <th style={{ padding: '8px 10px', borderBottom: '2px solid #ddd', fontWeight: 600 }}>Zone</th>
                        <th style={{ padding: '8px 10px', borderBottom: '2px solid #ddd', fontWeight: 600 }}>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {complexEvents.map((alert, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #eee',
                          backgroundColor: alert.alert_level === 'critical' ? '#fff5f5' :
                                           alert.alert_level === 'high'     ? '#fff8f0' : 'white' }}>
                          <td style={{ padding: '7px 10px' }}>
                            <SeverityBadge level={alert.alert_level} />
                          </td>
                          <td style={{ padding: '7px 10px', maxWidth: 320 }}>
                            <div style={{ fontWeight: 600, fontSize: 12 }}>{alert.pattern_name || alert.pattern_id}</div>
                            {alert.description && (
                              <div style={{ fontSize: 11, color: '#777', marginTop: 2 }}>{alert.description}</div>
                            )}
                          </td>
                          <td style={{ padding: '7px 10px', fontSize: 12 }}>{alert.zone || '—'}</td>
                          <td style={{ padding: '7px 10px', fontSize: 11, color: '#666', whiteSpace: 'nowrap' }}>
                            {fmtTime(alert.timestamp)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {complexEvents.length < complexCount && (
                  <div style={{ textAlign: 'center', marginTop: 12 }}>
                    <button className="btn-secondary"
                      onClick={() => fetchAlerts(complexSkip + PAGE_SIZE).catch(() => {})}>
                      Load more ({complexCount - complexEvents.length} remaining)
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p style={{ color: '#888', padding: '20px 0' }}>No alerts in the selected time window</p>
            )}
          </div>
        )}

        {/* ── PATTERNS ────────────────────────────────────────────────────── */}
        {activeTab === 'patterns' && (
          <div>
            <div className="card" style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', padding: '12px 20px' }}>
              <h3 style={{ margin: 0 }}>CEP Patterns</h3>
              <button className="btn-primary" onClick={openNewPattern}>+ New Pattern</button>
            </div>

            {patterns.length > 0 ? patterns.map((pattern, idx) => (
              <div key={idx} style={{ marginBottom: 12, padding: 16, backgroundColor: '#f9f9f9',
                borderRadius: 4, borderLeft: `4px solid ${getSeverityColor(pattern.severity)}` }}>
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
                  <span><strong>Matches:</strong> {pattern.match_count ?? 0}</span>
                </div>

                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 12, color: '#555' }}>EPL Rule</summary>
                  <pre style={{ fontSize: 11, background: '#eee', padding: 8, borderRadius: 4,
                    overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {pattern.epl_rule}
                  </pre>
                </details>
              </div>
            )) : <div className="card"><p>No patterns configured.</p></div>}
          </div>
        )}

        {/* ── SIMULATIONS ─────────────────────────────────────────────────── */}
        {activeTab === 'scenarios' && (
          <div>
            {/* Sensor note */}
            <div style={{ margin: '0 0 4px', padding: '12px 16px', borderRadius: 6,
              backgroundColor: '#fffde7', border: '1px solid #ffe082',
              fontSize: 13, color: '#6d5c00', lineHeight: 1.6 }}>
              <strong>📡 Note:</strong> The simulations below generate synthetic data for demonstration
              purposes. In production, these events would be replaced by real-time readings from
              <strong> physical urban sensors</strong> — air quality stations, traffic cameras,
              hospital IoT devices, and infrastructure monitoring systems.
            </div>

            {/* Live controls */}
            {simConfig && (
              <div className="card">
                <h3>Live Simulator Controls</h3>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12 }}>
                  <div>
                    <label className="form-label">Event Rate (evt/s)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="range" min={1} max={20} step={1}
                        value={simConfig.event_rate}
                        onChange={e => setSimConfig(s => ({ ...s, event_rate: +e.target.value }))}
                        onMouseUp={e => patchSimConfig({ event_rate: +e.target.value })}
                        style={{ width: 160 }} />
                      <strong style={{ minWidth: 36 }}>{simConfig.event_rate} evt/s</strong>
                    </div>
                  </div>

                  <div>
                    <label className="form-label">Force Zone</label>
                    <Sel value={simConfig.force_zone || ''}
                      onChange={v => patchSimConfig({ force_zone: v || null })}
                      placeholder="Any zone" options={ALL_ZONES} />
                  </div>

                  <div>
                    <label className="form-label">Force Severity</label>
                    <Sel value={simConfig.force_severity || ''}
                      onChange={v => patchSimConfig({ force_severity: v || null })}
                      placeholder="Any severity" options={SEVERITIES} />
                  </div>

                  <div style={{ marginLeft: 'auto' }}>
                    <button
                      className={simConfig.paused ? 'btn-success' : 'btn-warning'}
                      style={{ fontSize: 15, padding: '8px 20px' }}
                      onClick={() => patchSimConfig({ paused: !simConfig.paused })}>
                      {simConfig.paused ? '▶ Resume Simulator' : '⏸ Pause Simulator'}
                    </button>
                  </div>
                </div>

                {activeScenarioId && (
                  <p style={{ marginTop: 12, fontSize: 13, color: '#555' }}>
                    Active scenario: <strong>{activeScenarioId}</strong>
                    {' — '}these live controls override the scenario&apos;s defaults until the next scenario activation.
                  </p>
                )}
              </div>
            )}

            {/* Scenario list */}
            <div className="card" style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', padding: '12px 20px' }}>
              <h3 style={{ margin: 0 }}>Scenarios</h3>
              <button className="btn-primary" onClick={openNewScenario}>+ New Scenario</button>
            </div>

            {/* Presets */}
            {['is_preset', '!is_preset'].map(group => {
              const isPreset = group === 'is_preset';
              const list = scenarios.filter(s => !!s.is_preset === isPreset);
              if (list.length === 0) return null;
              return (
                <div key={group}>
                  <h4 style={{ margin: '16px 0 8px', color: '#555', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>
                    {isPreset ? '📦 Built-in Presets' : '✏️ Custom Scenarios'}
                  </h4>
                  {list.map((s, idx) => {
                    const isActive = activeScenarioId === s.scenario_id;
                    return (
                      <div key={idx} style={{ marginBottom: 10, padding: 16, borderRadius: 6,
                        backgroundColor: isActive ? '#e8f5e9' : '#f9f9f9',
                        border: isActive ? '2px solid #43a047' : '1px solid #e0e0e0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <h4 style={{ margin: 0 }}>{s.name}</h4>
                              {isActive && (
                                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10,
                                  backgroundColor: '#43a047', color: 'white' }}>● ACTIVE</span>
                              )}
                              <code style={{ fontSize: 11, color: '#888' }}>{s.scenario_id}</code>
                            </div>
                            {s.description && (
                              <p style={{ margin: '6px 0 8px', fontSize: 13, color: '#555' }}>{s.description}</p>
                            )}
                            {/* Scenario params */}
                            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#444' }}>
                              <span>⚡ <strong>{s.event_rate}</strong> evt/s</span>
                              {s.force_zone     && <span>📍 Zone: <strong>{s.force_zone}</strong></span>}
                              {s.force_severity && <span>🔴 Min severity: <SeverityBadge level={s.force_severity} /></span>}
                            </div>
                            {/* Domain weights */}
                            {s.domain_weights && (
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                                {ALL_DOMAINS.map(d => {
                                  const w = s.domain_weights[d] ?? 1;
                                  const maxW = Math.max(...Object.values(s.domain_weights));
                                  const pct  = Math.round((w / maxW) * 100);
                                  return (
                                    <div key={d} style={{ textAlign: 'center', width: 60 }}>
                                      <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>{getDomainIcon(d)}</div>
                                      <div style={{ height: 4, borderRadius: 2, backgroundColor: '#e0e0e0', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: '#1a3a52' }} />
                                      </div>
                                      <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>{w}x</div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                            <button
                              className={isActive ? 'btn-secondary' : 'btn-primary'}
                              style={{ fontSize: 12, padding: '6px 14px' }}
                              onClick={() => activateScenario(s.scenario_id)}
                              disabled={isActive}>
                              {isActive ? '✅ Active' : '▶ Activate'}
                            </button>
                            <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 14px' }}
                              onClick={() => cloneScenario(s)}>
                              📋 Clone
                            </button>
                            {!s.is_preset && (
                              <>
                                <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 14px' }}
                                  onClick={() => openEditScenario(s)}>
                                  ✏️ Edit
                                </button>
                                <button className="btn-danger" style={{ fontSize: 12, padding: '6px 14px' }}
                                  onClick={() => deleteScenario(s)}>
                                  🗑 Delete
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* ── PATTERN MODAL ───────────────────────────────────────────────── */}
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
                Enabled
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

        {/* ── SCENARIO MODAL ──────────────────────────────────────────────── */}
        {scenarioForm && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: 'white', borderRadius: 8, padding: 24,
              width: '90%', maxWidth: 680, maxHeight: '90vh', overflowY: 'auto' }}>
              <h3 style={{ marginTop: 0 }}>{scenarioForm._id ? 'Edit Scenario' : 'New Scenario'}</h3>
              {scenarioFormErr && <div className="error" style={{ marginBottom: 12 }}>{scenarioFormErr}</div>}

              <label className="form-label">Scenario ID * <small style={{ fontWeight: 'normal', color: '#888' }}>(slug, no spaces)</small></label>
              <input className="form-input" value={scenarioForm.scenario_id}
                disabled={!!scenarioForm._id}
                onChange={e => setScenarioForm(s => ({ ...s, scenario_id: e.target.value.replace(/\s+/g, '_') }))}
                placeholder="e.g. airport_flood" />

              <label className="form-label">Name *</label>
              <input className="form-input" value={scenarioForm.name}
                onChange={e => setScenarioForm(s => ({ ...s, name: e.target.value }))}
                placeholder="Short display name" />

              <label className="form-label">Description</label>
              <textarea className="form-input" rows={2} value={scenarioForm.description}
                onChange={e => setScenarioForm(s => ({ ...s, description: e.target.value }))}
                placeholder="What situation does this scenario simulate?" />

              <label className="form-label">Event Rate (evt/s) — 1 to 20</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input type="range" min={1} max={20} step={1}
                  value={scenarioForm.event_rate}
                  onChange={e => setScenarioForm(s => ({ ...s, event_rate: +e.target.value }))}
                  style={{ flex: 1 }} />
                <strong style={{ minWidth: 40 }}>{scenarioForm.event_rate}</strong>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">Force Zone <small style={{ fontWeight: 'normal', color: '#888' }}>(optional)</small></label>
                  <Sel value={scenarioForm.force_zone || ''}
                    onChange={v => setScenarioForm(s => ({ ...s, force_zone: v || '' }))}
                    placeholder="Any zone" options={ALL_ZONES} />
                </div>
                <div>
                  <label className="form-label">Min Severity <small style={{ fontWeight: 'normal', color: '#888' }}>(optional)</small></label>
                  <Sel value={scenarioForm.force_severity || ''}
                    onChange={v => setScenarioForm(s => ({ ...s, force_severity: v || '' }))}
                    placeholder="Any severity" options={SEVERITIES} />
                </div>
              </div>

              <label className="form-label" style={{ marginTop: 16 }}>
                Domain Weights <small style={{ fontWeight: 'normal', color: '#888' }}>1 (rare) → 10 (dominant)</small>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
                {ALL_DOMAINS.map(d => (
                  <div key={d} style={{ padding: '10px 12px', border: '1px solid #e0e0e0',
                    borderRadius: 6, backgroundColor: '#fafafa' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <label style={{ fontSize: 13, fontWeight: 600 }}>{getDomainIcon(d)} {d}</label>
                      <strong style={{ fontSize: 13 }}>{scenarioForm.domain_weights[d] ?? 1}</strong>
                    </div>
                    <input type="range" min={1} max={10} step={1}
                      value={scenarioForm.domain_weights[d] ?? 1}
                      onChange={e => setScenarioForm(s => ({
                        ...s,
                        domain_weights: { ...s.domain_weights, [d]: +e.target.value },
                      }))}
                      style={{ width: '100%' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#aaa' }}>
                      <span>Rare</span><span>Dominant</span>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={closeScenarioForm} disabled={scenarioLoading}>Cancel</button>
                <button className="btn-primary"   onClick={saveScenario}      disabled={scenarioLoading}>
                  {scenarioLoading ? 'Saving…' : 'Save Scenario'}
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
