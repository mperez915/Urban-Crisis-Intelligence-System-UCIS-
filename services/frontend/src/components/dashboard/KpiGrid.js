const KpiGrid = ({ eventsCount, criticalAlerts, complexEventsCount, enabledPatterns, totalPatterns }) => (
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
      <div className="stat-number" style={{ color: '#ff9800' }}>{complexEventsCount}</div>
      <div className="stat-label">Alerts (session)</div>
    </div>
    <div className="stat-box">
      <div className="stat-number" style={{ color: '#1a3a52' }}>
        {enabledPatterns}
        <span style={{ fontSize: 16, fontWeight: 'normal', color: '#888' }}>/{totalPatterns}</span>
      </div>
      <div className="stat-label">Active Patterns</div>
    </div>
  </div>
);

export default KpiGrid;
