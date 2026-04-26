import { ALL_DOMAINS, ALL_ZONES, PAGE_SIZE, SEVERITIES } from '../../utils/constants';
import { fmtTime } from '../../utils/format';
import { DomainIcon } from '../../utils/icons';
import ClearBtn from '../common/ClearBtn';
import FilterBar from '../common/FilterBar';
import Sel from '../common/Sel';
import SeverityBadge from '../common/SeverityBadge';

const EventsTab = ({
  events, eventsCount, eventsSkip,
  evtDomain, setEvtDomain,
  evtZone, setEvtZone,
  evtSeverity, setEvtSeverity,
  onLoadMore,
}) => (
  <div className="card">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <h3 style={{ margin: 0 }}>Recent Events</h3>
      <small style={{ color: '#888' }}>{events.length} shown / {eventsCount.toLocaleString()} total</small>
    </div>
    <FilterBar>
      <Sel value={evtDomain}   onChange={setEvtDomain}   placeholder="All domains"    options={ALL_DOMAINS} />
      <Sel value={evtZone}     onChange={setEvtZone}     placeholder="All zones"      options={ALL_ZONES} />
      <Sel value={evtSeverity} onChange={setEvtSeverity} placeholder="All severities" options={SEVERITIES} />
      {(evtDomain || evtZone || evtSeverity) &&
        <ClearBtn onClick={() => { setEvtDomain(''); setEvtZone(''); setEvtSeverity(''); }} />}
    </FilterBar>
    {events.length > 0 ? (
      <>
        <ul className="event-list">
          {events.map((event, idx) => (
            <li key={idx} className={`event-item ${event.severity}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong><DomainIcon domain={event.domain} /> {event.domain} — {event.type}</strong>
                <SeverityBadge level={event.severity} />
              </div>
              <p style={{ fontSize: 13, margin: '4px 0' }}>Zone: <strong>{event.zone}</strong></p>
              <small>{fmtTime(event.timestamp)}</small>
            </li>
          ))}
        </ul>
        {events.length < eventsCount && (
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button className="btn-secondary"
              onClick={() => onLoadMore(eventsSkip + PAGE_SIZE)}>
              Load more ({eventsCount - events.length} remaining)
            </button>
          </div>
        )}
      </>
    ) : (
      <p>No events match the current filters</p>
    )}
  </div>
);

export default EventsTab;
