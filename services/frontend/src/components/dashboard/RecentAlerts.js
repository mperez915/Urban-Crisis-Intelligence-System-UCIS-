import SeverityBadge from '../common/SeverityBadge';
import { fmtTime } from '../../utils/format';

const RecentAlerts = ({ complexEvents }) => (
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
);

export default RecentAlerts;
