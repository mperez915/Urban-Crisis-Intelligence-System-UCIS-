import {
    Area, AreaChart,
    CartesianGrid,
    ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import SeverityBadge from '../common/SeverityBadge';

const GRANULARITY_OPTIONS = [
  { id: '10s', label: '10 s buckets' },
  { id: '1m',  label: '1 min buckets' },
  { id: '5m',  label: '5 min buckets' },
];

const GRADIENTS = [
  ['gradLow',      '#4caf50'],
  ['gradMedium',   '#ffc107'],
  ['gradHigh',     '#ff9800'],
  ['gradCritical', '#ff4444'],
];

const EventRateChart = ({ chartData, granularity, onGranularityChange, label }) => {
  const counts = chartData.map(d => d.count || 0);
  const total  = counts.reduce((a, b) => a + b, 0);
  const peak   = counts.length ? Math.max(...counts) : 0;
  const avg    = counts.length ? (total / counts.length).toFixed(1) : '0';
  const sevTotals = ['critical', 'high', 'medium', 'low'].map(s => ({
    sev: s,
    n: chartData.reduce((acc, d) => acc + (d[s] || 0), 0),
  }));
  const unitWord = granularity === '10s' ? '/10 s'
                : granularity === '5m'  ? '/5 min' : '/min';
  const yWidth = peak >= 10000 ? 60 : peak >= 1000 ? 52 : peak >= 100 ? 40 : 32;
  const fmtAxis = v => v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : v;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>{label || 'Event Rate'}</h3>
        <div style={{ display: 'inline-flex', border: '1px solid #ddd',
          borderRadius: 6, overflow: 'hidden', fontSize: 12 }}>
          {GRANULARITY_OPTIONS.map(opt => (
            <button key={opt.id}
              onClick={() => onGranularityChange(opt.id)}
              style={{
                padding: '6px 12px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: granularity === opt.id ? '#1a3a52' : 'white',
                color: granularity === opt.id ? 'white' : '#333',
                fontWeight: granularity === opt.id ? 600 : 400,
              }}>{opt.label}</button>
          ))}
        </div>
      </div>
      {chartData.length > 0 && (
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#444',
          alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <span><strong>Buffered points:</strong> {chartData.length}</span>
          <span><strong>Total:</strong> {total.toLocaleString()}</span>
          <span><strong>Peak:</strong> {peak.toLocaleString()} {unitWord}</span>
          <span><strong>Avg:</strong> {avg} {unitWord}</span>
          <span style={{ display: 'inline-flex', gap: 6 }}>
            {sevTotals.filter(s => s.n > 0).map(s => (
              <SeverityBadge key={s.sev} level={s.sev}
                style={{ fontSize: 10 }}>{s.sev}: {s.n}</SeverityBadge>
            ))}
          </span>
        </div>
      )}
      {chartData.length > 1 ? (
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}
              margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                {GRADIENTS.map(([id, color]) => (
                  <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={color} stopOpacity={0.85} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.35} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="_id" tick={{ fontSize: 10 }}
                interval="preserveStartEnd" minTickGap={50} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }}
                width={yWidth} domain={[0, 'auto']}
                tickFormatter={fmtAxis} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 4 }}
                labelFormatter={l => `Time: ${l}`}
                formatter={(val, name) => [val, name]} />
              <Area type="monotone" dataKey="low"      stackId="1" isAnimationActive={false}
                stroke="#4caf50" fill="url(#gradLow)"      strokeWidth={1} name="low" />
              <Area type="monotone" dataKey="medium"   stackId="1" isAnimationActive={false}
                stroke="#ffc107" fill="url(#gradMedium)"   strokeWidth={1} name="medium" />
              <Area type="monotone" dataKey="high"     stackId="1" isAnimationActive={false}
                stroke="#ff9800" fill="url(#gradHigh)"     strokeWidth={1} name="high" />
              <Area type="monotone" dataKey="critical" stackId="1" isAnimationActive={false}
                stroke="#ff4444" fill="url(#gradCritical)" strokeWidth={1} name="critical" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p style={{ color: '#888', padding: '20px 0' }}>
          Collecting data points… they will accumulate here as the simulator runs.
        </p>
      )}
    </div>
  );
};

export default EventRateChart;
