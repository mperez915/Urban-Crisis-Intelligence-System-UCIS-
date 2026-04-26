import { CheckCircle2, Pause, Pencil, Play, Plus, Trash2, XCircle } from 'lucide-react';
import { getSeverityColor } from '../../utils/format';
import { DomainIcon } from '../../utils/icons';

const ICON_BTN = { verticalAlign: '-3px', marginRight: 4 };

const PatternCard = ({ pattern, onToggle, onEdit, onDelete }) => (
  <div style={{ marginBottom: 12, padding: 16, backgroundColor: '#f9f9f9',
    borderRadius: 4, borderLeft: `4px solid ${getSeverityColor(pattern.severity)}` }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <h4 style={{ margin: '0 0 4px' }}>{pattern.name || pattern.pattern_id}</h4>
        <small style={{ color: '#666' }}>{pattern.pattern_id}</small>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button className={pattern.enabled ? 'btn-warning' : 'btn-success'}
          onClick={() => onToggle(pattern)}>
          {pattern.enabled
            ? <><Pause size={14} style={ICON_BTN} />Disable</>
            : <><Play  size={14} style={ICON_BTN} />Enable</>}
        </button>
        <button className="btn-secondary" onClick={() => onEdit(pattern)}>
          <Pencil size={14} style={ICON_BTN} />Edit
        </button>
        <button className="btn-danger" onClick={() => onDelete(pattern)}>
          <Trash2 size={14} style={ICON_BTN} />Delete
        </button>
      </div>
    </div>

    {pattern.description && <p style={{ margin: '8px 0 4px', fontSize: 13 }}>{pattern.description}</p>}

    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, marginTop: 8 }}>
      <span><strong>Severity:</strong> <span style={{ color: getSeverityColor(pattern.severity) }}>{pattern.severity}</span></span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <strong>Status:</strong>
        {pattern.enabled
          ? <><CheckCircle2 size={14} color="#4caf50" /> Enabled</>
          : <><XCircle      size={14} color="#888" />    Disabled</>}
      </span>
      {pattern.input_domains?.length > 0 && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <strong>Domains:</strong>
          {pattern.input_domains.map((d, i) => (
            <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <DomainIcon domain={d} /> {d}{i < pattern.input_domains.length - 1 ? ',' : ''}
            </span>
          ))}
        </span>
      )}
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
);

const PatternsTab = ({ patterns, onNew, onToggle, onEdit, onDelete }) => (
  <div>
    <div className="card" style={{ display: 'flex', justifyContent: 'space-between',
      alignItems: 'center', padding: '12px 20px' }}>
      <h3 style={{ margin: 0 }}>CEP Patterns</h3>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-primary" onClick={onNew}>
          <Plus size={14} style={ICON_BTN} />New Pattern
        </button>
      </div>
    </div>

    {patterns.length > 0 ? patterns.map((p, idx) => (
      <PatternCard key={idx} pattern={p}
        onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />
    )) : <div className="card"><p>No patterns configured.</p></div>}
  </div>
);

export default PatternsTab;
