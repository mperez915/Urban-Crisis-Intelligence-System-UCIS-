import { CheckCircle2, Copy, MapPin, Pencil, Play, Trash2, Zap } from 'lucide-react';
import { ALL_DOMAINS } from '../../utils/constants';
import { DomainIcon } from '../../utils/icons';
import SeverityBadge from '../common/SeverityBadge';

const ScenarioCard = ({ scenario: s, isActive, onActivate, onClone, onEdit, onDelete }) => (
  <div style={{ marginBottom: 10, padding: 16, borderRadius: 6,
    backgroundColor: isActive ? '#e8f5e9' : '#f9f9f9',
    border: isActive ? '2px solid #43a047' : '1px solid #e0e0e0' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h4 style={{ margin: 0 }}>{s.name}</h4>
          {isActive && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10,
              backgroundColor: '#43a047', color: 'white', display: 'inline-flex',
              alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'white' }} />
              ACTIVE
            </span>
          )}
          <code style={{ fontSize: 11, color: '#888' }}>{s.scenario_id}</code>
        </div>
        {s.description && (
          <p style={{ margin: '6px 0 8px', fontSize: 13, color: '#555' }}>{s.description}</p>
        )}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#444', alignItems: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Zap size={12} /> <strong>{s.event_rate}</strong> evt/s
          </span>
          {s.force_zone && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <MapPin size={12} /> Zone: <strong>{s.force_zone}</strong>
            </span>
          )}
          {s.force_severity && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              Min severity: <SeverityBadge level={s.force_severity} />
            </span>
          )}
        </div>
        {s.domain_weights && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {ALL_DOMAINS.map(d => {
              const w = s.domain_weights[d] ?? 1;
              const maxW = Math.max(...Object.values(s.domain_weights));
              const pct  = Math.round((w / maxW) * 100);
              return (
                <div key={d} style={{ textAlign: 'center', width: 60 }}>
                  <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}><DomainIcon domain={d} size={12} /></div>
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        <button
          className={isActive ? 'btn-secondary' : 'btn-primary'}
          style={{ fontSize: 12, padding: '6px 14px' }}
          onClick={() => onActivate(s.scenario_id)}
          disabled={isActive}>
          {isActive
            ? <><CheckCircle2 size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Active</>
            : <><Play         size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Activate</>}
        </button>
        <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 14px' }}
          onClick={() => onClone(s)}>
          <Copy size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Clone
        </button>
        {!s.is_preset && (
          <>
            <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 14px' }}
              onClick={() => onEdit(s)}>
              <Pencil size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Edit
            </button>
            <button className="btn-danger" style={{ fontSize: 12, padding: '6px 14px' }}
              onClick={() => onDelete(s)}>
              <Trash2 size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Delete
            </button>
          </>
        )}
      </div>
    </div>
  </div>
);

export default ScenarioCard;
