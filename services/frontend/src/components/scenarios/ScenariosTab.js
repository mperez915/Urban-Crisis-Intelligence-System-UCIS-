import { Package, Pencil, Plus, Radio } from 'lucide-react';
import ScenarioCard from './ScenarioCard';
import SimulatorControls from './SimulatorControls';

const ScenariosTab = ({
  simConfig, setSimConfig, patchSimConfig,
  scenarios, activeScenarioId,
  onNewScenario, onActivate, onClone, onEdit, onDelete,
}) => (
  <div>
    <div style={{ margin: '0 0 4px', padding: '12px 16px', borderRadius: 6,
      backgroundColor: '#fffde7', border: '1px solid #ffe082',
      fontSize: 13, color: '#6d5c00', lineHeight: 1.6 }}>
      <Radio size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
      <strong>Note:</strong> The simulations below generate synthetic data for demonstration
      purposes. In production, these events would be replaced by real-time readings from
      <strong> physical urban sensors</strong> — air quality stations, traffic cameras,
      hospital IoT devices, and infrastructure monitoring systems.
    </div>

    <SimulatorControls
      simConfig={simConfig}
      setSimConfig={setSimConfig}
      patchSimConfig={patchSimConfig}
      activeScenarioId={activeScenarioId} />

    <div className="card" style={{ display: 'flex', justifyContent: 'space-between',
      alignItems: 'center', padding: '12px 20px' }}>
      <h3 style={{ margin: 0 }}>Scenarios</h3>
      <button className="btn-primary" onClick={onNewScenario}>
        <Plus size={14} style={{ verticalAlign: '-3px', marginRight: 4 }} />New Scenario
      </button>
    </div>

    {[true, false].map(isPreset => {
      const list = scenarios.filter(s => !!s.is_preset === isPreset);
      if (list.length === 0) return null;
      return (
        <div key={isPreset ? 'preset' : 'custom'}>
          <h4 style={{ margin: '16px 0 8px', color: '#555', fontSize: 13, textTransform: 'uppercase',
            letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            {isPreset
              ? <><Package size={13} /> Built-in Presets</>
              : <><Pencil  size={13} /> Custom Scenarios</>}
          </h4>
          {list.map((s, idx) => (
            <ScenarioCard key={idx}
              scenario={s}
              isActive={activeScenarioId === s.scenario_id}
              onActivate={onActivate}
              onClone={onClone}
              onEdit={onEdit}
              onDelete={onDelete} />
          ))}
        </div>
      );
    })}
  </div>
);

export default ScenariosTab;
