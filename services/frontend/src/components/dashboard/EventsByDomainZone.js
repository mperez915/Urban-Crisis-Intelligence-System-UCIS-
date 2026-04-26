import { ALL_ZONES } from '../../utils/constants';
import { DomainIcon } from '../../utils/icons';

const EventsByDomainZone = ({ events }) => {
  const byDomain = {};
  events.forEach(e => {
    if (!byDomain[e.domain]) byDomain[e.domain] = { total: 0, zones: {} };
    byDomain[e.domain].total += 1;
    byDomain[e.domain].zones[e.zone] = (byDomain[e.domain].zones[e.zone] || 0) + 1;
  });

  return (
    <div className="card">
      <h3>Events by Domain &amp; Zone <small style={{ fontWeight: 'normal', fontSize: 12, color: '#888' }}>(last {events.length} loaded)</small></h3>
      {events.length > 0 ? (
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
                  <td style={{ padding: '9px 12px' }}><DomainIcon domain={domain} /> {domain}</td>
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
      ) : <p style={{ color: '#888', padding: '12px 0' }}>No event data yet.</p>}
    </div>
  );
};

export default EventsByDomainZone;
