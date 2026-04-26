import EventRateChart from './EventRateChart';
import EventsByDomainZone from './EventsByDomainZone';
import KpiGrid from './KpiGrid';
import PatternTriggerTable from './PatternTriggerTable';
import RecentAlerts from './RecentAlerts';
import SimulatorStrip from './SimulatorStrip';

const Dashboard = ({
  eventsCount, criticalAlerts, complexEvents, patterns, events,
  enabledPatterns, simConfig, onTogglePause, onManageClick,
  chartData, chartGranularity, onGranularityChange, statsLabel,
  topAlerts,
}) => (
  <div>
    <KpiGrid
      eventsCount={eventsCount}
      criticalAlerts={criticalAlerts}
      complexEventsCount={complexEvents.length}
      enabledPatterns={enabledPatterns}
      totalPatterns={patterns.length} />

    <SimulatorStrip
      simConfig={simConfig}
      onTogglePause={onTogglePause}
      onManageClick={onManageClick} />

    <EventRateChart
      chartData={chartData}
      granularity={chartGranularity}
      onGranularityChange={onGranularityChange}
      label={statsLabel} />

    <PatternTriggerTable topAlerts={topAlerts} patterns={patterns} />

    <EventsByDomainZone events={events} />

    <RecentAlerts complexEvents={complexEvents} />
  </div>
);

export default Dashboard;
