import SeverityBadge from '../common/SeverityBadge';

const PatternTriggerTable = ({ topAlerts, patterns }) => (
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
);

export default PatternTriggerTable;
