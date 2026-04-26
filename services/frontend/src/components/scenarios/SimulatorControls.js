import { Pause, Play } from 'lucide-react';
import { ALL_ZONES, SEVERITIES } from '../../utils/constants';
import Sel from '../common/Sel';

const SimulatorControls = ({ simConfig, setSimConfig, patchSimConfig, activeScenarioId }) => {
  if (!simConfig) return null;
  return (
    <div className="card">
      <h3>Live Simulator Controls</h3>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12 }}>
        <div>
          <label className="form-label">Event Rate (evt/s)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="range" min={1} max={20} step={1}
              value={simConfig.event_rate}
              onChange={e => setSimConfig(s => ({ ...s, event_rate: +e.target.value }))}
              onMouseUp={e => patchSimConfig({ event_rate: +e.target.value })}
              style={{ width: 160 }} />
            <strong style={{ minWidth: 36 }}>{simConfig.event_rate} evt/s</strong>
          </div>
        </div>

        <div>
          <label className="form-label">Force Zone</label>
          <Sel value={simConfig.force_zone || ''}
            onChange={v => patchSimConfig({ force_zone: v || null })}
            placeholder="Any zone" options={ALL_ZONES} />
        </div>

        <div>
          <label className="form-label">Force Severity</label>
          <Sel value={simConfig.force_severity || ''}
            onChange={v => patchSimConfig({ force_severity: v || null })}
            placeholder="Any severity" options={SEVERITIES} />
        </div>

        <div style={{ marginLeft: 'auto' }}>
          <button
            className={simConfig.paused ? 'btn-success' : 'btn-warning'}
            style={{ fontSize: 15, padding: '8px 20px' }}
            onClick={() => patchSimConfig({ paused: !simConfig.paused })}>
            {simConfig.paused
              ? <><Play  size={15} style={{ verticalAlign: '-3px', marginRight: 6 }} />Resume Simulator</>
              : <><Pause size={15} style={{ verticalAlign: '-3px', marginRight: 6 }} />Pause Simulator</>}
          </button>
        </div>
      </div>

      {activeScenarioId && (
        <p style={{ marginTop: 12, fontSize: 13, color: '#555' }}>
          Active scenario: <strong>{activeScenarioId}</strong>
          {' — '}these live controls override the scenario&apos;s defaults until the next scenario activation.
        </p>
      )}
    </div>
  );
};

export default SimulatorControls;
