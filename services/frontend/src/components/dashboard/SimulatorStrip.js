import { ArrowRight, Clapperboard, Pause, Play } from 'lucide-react';
import SeverityBadge from '../common/SeverityBadge';

const SimulatorStrip = ({ simConfig, onTogglePause, onManageClick }) => {
  if (!simConfig) return null;
  return (
    <div className="card" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center',
      gap: 20, flexWrap: 'wrap', background: simConfig.paused ? '#fff8e1' : '#f0f9f0' }}>
      <strong style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Clapperboard size={15} /> Simulator
      </strong>
      <span style={{ fontSize: 13 }}>
        Scenario: <strong>{simConfig.active_scenario_id || '—'}</strong>
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
          onClick={onTogglePause}>
          {simConfig.paused
            ? <><Play  size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />Resume</>
            : <><Pause size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />Pause</>}
        </button>
        <button className="btn-secondary"
          style={{ padding: '4px 12px', fontSize: 12 }}
          onClick={onManageClick}>
          Manage <ArrowRight size={12} style={{ verticalAlign: '-2px', marginLeft: 2 }} />
        </button>
      </span>
    </div>
  );
};

export default SimulatorStrip;
