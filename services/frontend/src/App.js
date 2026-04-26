import axios from 'axios';
import {
    AlertTriangle, BellRing, Clapperboard, LayoutDashboard, ListChecks, Settings,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import './index.css';

import {
    API_URL,
    EMPTY_PATTERN, EMPTY_SCENARIO,
    MAX_BUFFER_POINTS,
    PAGE_SIZE,
    WS_URL,
} from './utils/constants';

import AlertsTab from './components/alerts/AlertsTab';
import WsIndicator from './components/common/WsIndicator';
import Dashboard from './components/dashboard/Dashboard';
import EventsTab from './components/events/EventsTab';
import PatternModal from './components/patterns/PatternModal';
import PatternsTab from './components/patterns/PatternsTab';
import ScenarioModal from './components/scenarios/ScenarioModal';
import ScenariosTab from './components/scenarios/ScenariosTab';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  // data
  const [events, setEvents]               = useState([]);
  const [eventsCount, setEventsCount]     = useState(0);
  const [eventsSkip, setEventsSkip]       = useState(0);
  const [complexEvents, setComplexEvents] = useState([]);
  const [complexCount, setComplexCount]   = useState(0);
  const [patterns, setPatterns]           = useState([]);
  const [stats, setStats]                 = useState({});
  const [topAlerts, setTopAlerts]         = useState([]);

  // scenarios + sim config
  const [scenarios, setScenarios]             = useState([]);
  const [simConfig, setSimConfig]             = useState(null);
  const [scenarioForm, setScenarioForm]       = useState(null);
  const [scenarioFormErr, setScenarioFormErr] = useState(null);
  const [scenarioLoading, setScenarioLoading] = useState(false);

  // ui
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [wsConnected, setWsConnected] = useState(false);

  // filters — Events
  const [evtDomain,   setEvtDomain]   = useState('');
  const [evtZone,     setEvtZone]     = useState('');
  const [evtSeverity, setEvtSeverity] = useState('');

  // filters — Alerts
  const [altPatternId,  setAltPatternId]  = useState('');
  const [altAlertLevel, setAltAlertLevel] = useState('');
  const [altSince,      setAltSince]      = useState('60');

  // Pattern CRUD
  const [patternForm, setPatternForm] = useState(null);
  const [formError,   setFormError]   = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [jsonMode, setJsonMode]       = useState(false);
  const [jsonInput, setJsonInput]     = useState('');

  // Chart granularity
  const [chartGranularity, setChartGranularity] = useState('10s');
  const [chartBuffers, setChartBuffers] = useState({ '10s': [], '1m': [], '5m': [] });

  const socketRef = useRef(null);

  // ── WebSocket ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(WS_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('connect',    () => setWsConnected(true));
    socket.on('disconnect', () => setWsConnected(false));
    socket.on('complex_event', () => {
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
          axios.get(`${API_URL}/events/complex?grouped=true&since=60`),
          axios.get(`${API_URL}/stats/events-per-minute?granularity=${chartGranularity}`),
          axios.get(`${API_URL}/patterns`),
          axios.get(`${API_URL}/stats/top-alerts`),
          axios.get(`${API_URL}/scenarios`),
          axios.get(`${API_URL}/simulator/config`),
        ]);
      setEvents(evtRes.data.events || []);
      setEventsCount(evtRes.data.count || 0);
      setEventsSkip(0);
      setComplexEvents(alertRes.data.events || []);
      setComplexCount(alertRes.data.count || 0);
      setStats(statsRes.data || {});

      const incoming = statsRes.data?.data || [];
      const grain = statsRes.data?.granularity || chartGranularity;
      setChartBuffers(prev => {
        const existing = prev[grain] || [];
        const map = new Map(existing.map(p => [p.bucket_ms, p]));
        for (const point of incoming) {
          if (point.bucket_ms != null) map.set(point.bucket_ms, point);
        }
        const merged = Array.from(map.values())
          .sort((a, b) => a.bucket_ms - b.bucket_ms)
          .slice(-MAX_BUFFER_POINTS);
        return { ...prev, [grain]: merged };
      });
      setPatterns(patternsRes.data.patterns || []);
      setTopAlerts(topRes.data.data || []);
      setScenarios(scenariosRes.data.scenarios || []);
      setSimConfig(simRes.data);
    } catch (err) {
      setError(err.message);
    }
  }, [chartGranularity]);

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

  const fetchAlerts = useCallback(async () => {
    const params = new URLSearchParams({ grouped: 'true' });
    if (altPatternId)  params.set('pattern_id',  altPatternId);
    if (altAlertLevel) params.set('alert_level',  altAlertLevel);
    if (altSince)      params.set('since',        altSince);
    const res = await axios.get(`${API_URL}/events/complex?${params}`);
    setComplexEvents(res.data.events || []);
    setComplexCount(res.data.count || 0);
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
  const openNewPattern     = () => { setPatternForm({ ...EMPTY_PATTERN }); setFormError(null); setJsonMode(false); setJsonInput(''); };

  const openEditPattern    = (p) => { setPatternForm({ ...p, input_domains: Array.isArray(p.input_domains) ? p.input_domains : [] }); setFormError(null); setJsonMode(false); setJsonInput(''); };
  const closeForm          = () => { setPatternForm(null); setFormError(null); setJsonMode(false); setJsonInput(''); };
  const handleFormChange   = (f, v) => setPatternForm(prev => ({ ...prev, [f]: v }));
  const toggleDomain       = (d) => setPatternForm(prev => ({
    ...prev,
    input_domains: prev.input_domains.includes(d)
      ? prev.input_domains.filter(x => x !== d)
      : [...prev.input_domains, d],
  }));

  const toggleJsonMode = () => {
    if (!jsonMode) {
      setJsonInput(JSON.stringify(patternForm, null, 2));
    } else {
      try {
        const parsed = JSON.parse(jsonInput);
        setPatternForm({
          ...EMPTY_PATTERN,
          ...parsed,
          input_domains: Array.isArray(parsed.input_domains) ? parsed.input_domains : [],
        });
        setFormError(null);
      } catch (err) {
        setFormError('Invalid JSON: ' + err.message);
        return;
      }
    }
    setJsonMode(!jsonMode);
  };

  const savePattern = async () => {
    setFormError(null);
    let dataToSave = patternForm;
    if (jsonMode) {
      try {
        dataToSave = JSON.parse(jsonInput);
      } catch (err) {
        setFormError('Invalid JSON: ' + err.message);
        return;
      }
    }
    if (!dataToSave.pattern_id?.trim()) { setFormError('pattern_id is required'); return; }
    if (!dataToSave.epl_rule?.trim())   { setFormError('EPL rule is required');    return; }

    setFormLoading(true);
    try {
      if (!patternForm._id && !dataToSave._id) {
        await axios.post(`${API_URL}/patterns`, dataToSave);
      } else {
        const { _id, ...data } = dataToSave;
        await axios.put(`${API_URL}/patterns/${dataToSave.pattern_id}`, data);
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

  const openNewScenario   = () => { setScenarioForm({ ...EMPTY_SCENARIO }); setScenarioFormErr(null); };
  const openEditScenario  = (s) => { setScenarioForm({ ...s }); setScenarioFormErr(null); };
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

  // ── Derived ────────────────────────────────────────────────────────────────
  const criticalAlerts   = complexEvents.filter(e => e.alert_level === 'critical').length;
  const enabledPatterns  = patterns.filter(p => p.enabled).length;
  const activeScenarioId = simConfig?.active_scenario_id;
  const chartData        = chartBuffers[chartGranularity] || [];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      <div className="header">
        <h1>
          <AlertTriangle size={22} style={{ verticalAlign: '-4px', marginRight: 8 }} />
          Urban Crisis Intelligence System (UCIS)
        </h1>
        <p>Real-time Crisis Detection &amp; Monitoring Dashboard &nbsp;<WsIndicator connected={wsConnected} /></p>
      </div>

      <div className="container">
        {error && <div className="error">Error: {error}</div>}

        <div className="tab-navigation">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Overview' },
            { id: 'alerts',    icon: BellRing,        label: `Alerts (${complexEvents.length})` },
            { id: 'events',    icon: ListChecks,      label: `Events (${events.length})` },
            { id: 'patterns',  icon: Settings,        label: `Patterns (${patterns.length})` },
            { id: 'scenarios', icon: Clapperboard,    label: 'Simulations' },
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id}
                className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}>
                <Icon size={15} style={{ verticalAlign: '-3px', marginRight: 6 }} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {loading && <div className="loading">Loading…</div>}

        {activeTab === 'dashboard' && (
          <Dashboard
            eventsCount={eventsCount}
            criticalAlerts={criticalAlerts}
            complexEvents={complexEvents}
            patterns={patterns}
            events={events}
            enabledPatterns={enabledPatterns}
            simConfig={simConfig}
            onTogglePause={() => patchSimConfig({ paused: !simConfig.paused })}
            onManageClick={() => setActiveTab('scenarios')}
            chartData={chartData}
            chartGranularity={chartGranularity}
            onGranularityChange={setChartGranularity}
            statsLabel={stats.label}
            topAlerts={topAlerts} />
        )}

        {activeTab === 'events' && (
          <EventsTab
            events={events}
            eventsCount={eventsCount}
            eventsSkip={eventsSkip}
            evtDomain={evtDomain}     setEvtDomain={setEvtDomain}
            evtZone={evtZone}         setEvtZone={setEvtZone}
            evtSeverity={evtSeverity} setEvtSeverity={setEvtSeverity}
            onLoadMore={(skip) => fetchEvents(skip).catch(() => {})} />
        )}

        {activeTab === 'alerts' && (
          <AlertsTab
            complexEvents={complexEvents}
            patterns={patterns}
            wsConnected={wsConnected}
            altPatternId={altPatternId}     setAltPatternId={setAltPatternId}
            altAlertLevel={altAlertLevel}   setAltAlertLevel={setAltAlertLevel}
            altSince={altSince}             setAltSince={setAltSince}
            onClearSession={() => setComplexEvents([])} />
        )}

        {activeTab === 'patterns' && (
          <PatternsTab
            patterns={patterns}
            onNew={openNewPattern}
            onToggle={togglePattern}
            onEdit={openEditPattern}
            onDelete={deletePattern} />
        )}

        {activeTab === 'scenarios' && (
          <ScenariosTab
            simConfig={simConfig}
            setSimConfig={setSimConfig}
            patchSimConfig={patchSimConfig}
            scenarios={scenarios}
            activeScenarioId={activeScenarioId}
            onNewScenario={openNewScenario}
            onActivate={activateScenario}
            onClone={cloneScenario}
            onEdit={openEditScenario}
            onDelete={deleteScenario} />
        )}

        {patternForm && (
          <PatternModal
            patternForm={patternForm}
            jsonMode={jsonMode}
            jsonInput={jsonInput}
            formError={formError}
            formLoading={formLoading}
            onChangeField={handleFormChange}
            onToggleDomain={toggleDomain}
            onToggleJsonMode={toggleJsonMode}
            onJsonInputChange={setJsonInput}
            onSave={savePattern}
            onClose={closeForm} />
        )}

        {scenarioForm && (
          <ScenarioModal
            scenarioForm={scenarioForm}
            setScenarioForm={setScenarioForm}
            scenarioFormErr={scenarioFormErr}
            scenarioLoading={scenarioLoading}
            onSave={saveScenario}
            onClose={closeScenarioForm} />
        )}
      </div>
    </div>
  );
}

export default App;
