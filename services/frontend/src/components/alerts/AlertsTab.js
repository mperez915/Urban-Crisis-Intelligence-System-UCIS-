import FilterBar from '../common/FilterBar';
import Sel from '../common/Sel';
import ClearBtn from '../common/ClearBtn';
import WsIndicator from '../common/WsIndicator';
import SeverityBadge from '../common/SeverityBadge';
import { SEVERITIES } from '../../utils/constants';
import { fmtTime } from '../../utils/format';

const TIME_WINDOW_OPTIONS = [
  { value: '15',  label: 'Last 15 min' },
  { value: '60',  label: 'Last hour' },
  { value: '360', label: 'Last 6 h' },
  { value: '0',   label: 'All time' },
];

const AlertsTab = ({
  complexEvents, patterns, wsConnected,
  altPatternId, setAltPatternId,
  altAlertLevel, setAltAlertLevel,
  altSince, setAltSince,
  onClearSession,
}) => (
  <div className="card">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <h3 style={{ margin: 0 }}>
        Complex Events &amp; Alerts
        <small style={{ fontWeight: 'normal', fontSize: 12, color: '#888', marginLeft: 8 }}>
          {complexEvents.length} unique pattern–zone combinations in window
        </small>
      </h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <WsIndicator connected={wsConnected} />
        <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}
          onClick={onClearSession}>
          Clear session
        </button>
      </div>
    </div>

    <FilterBar>
      <Sel value={altSince} onChange={setAltSince} placeholder="Time window" options={TIME_WINDOW_OPTIONS} />
      <Sel value={altAlertLevel} onChange={setAltAlertLevel} placeholder="All severities" options={SEVERITIES} />
      <Sel value={altPatternId} onChange={setAltPatternId} placeholder="All patterns"
        options={patterns.map(p => ({ value: p.pattern_id, label: p.name || p.pattern_id }))} />
      {(altPatternId || altAlertLevel || altSince !== '60') &&
        <ClearBtn onClick={() => { setAltPatternId(''); setAltAlertLevel(''); setAltSince('60'); }} />}
    </FilterBar>

    {complexEvents.length > 0 ? (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ backgroundColor: '#f0f4f8', textAlign: 'left' }}>
              <th style={{ padding: '8px 10px', borderBottom: '2px solid #ddd', fontWeight: 600 }}>Severity</th>
              <th style={{ padding: '8px 10px', borderBottom: '2px solid #ddd', fontWeight: 600 }}>Pattern</th>
              <th style={{ padding: '8px 10px', borderBottom: '2px solid #ddd', fontWeight: 600 }}>Zone</th>
              <th style={{ padding: '8px 10px', borderBottom: '2px solid #ddd', fontWeight: 600, textAlign: 'right' }}>Triggers</th>
              <th style={{ padding: '8px 10px', borderBottom: '2px solid #ddd', fontWeight: 600 }}>Last seen</th>
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
                <td style={{ padding: '7px 10px', maxWidth: 280 }}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{alert.pattern_name || alert.pattern_id}</div>
                  {alert.description && (
                    <div style={{ fontSize: 11, color: '#777', marginTop: 2 }}>{alert.description}</div>
                  )}
                </td>
                <td style={{ padding: '7px 10px', fontSize: 12 }}>{alert.zone || '—'}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700,
                  color: alert.occurrences > 100 ? '#ff4444' : alert.occurrences > 10 ? '#ff9800' : '#333' }}>
                  {(alert.occurrences || 1).toLocaleString()}
                </td>
                <td style={{ padding: '7px 10px', fontSize: 11, color: '#666', whiteSpace: 'nowrap' }}>
                  {fmtTime(alert.last_seen || alert.timestamp)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <p style={{ color: '#888', padding: '20px 0' }}>No alerts in the selected time window</p>
    )}
  </div>
);

export default AlertsTab;
