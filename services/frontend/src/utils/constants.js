export const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
export const WS_URL  = process.env.REACT_APP_WEBSOCKET_URL || 'http://localhost:8083';

export const SEVERITIES  = ['low', 'medium', 'high', 'critical'];
export const ALL_DOMAINS = ['traffic', 'climate', 'health', 'environment', 'population'];
export const ALL_ZONES   = ['downtown', 'suburbs', 'industrial', 'residential', 'airport'];
export const PAGE_SIZE   = 50;

// Cap how many buckets we keep client-side per granularity to avoid unbounded memory.
export const MAX_BUFFER_POINTS = 600;

export const EMPTY_PATTERN = {
  pattern_id: '', name: '', description: '',
  epl_rule: '', severity: 'medium', enabled: true, input_domains: [],
};

export const EMPTY_SCENARIO = {
  scenario_id: '', name: '', description: '',
  event_rate: 10, force_severity: '', force_zone: '',
  domain_weights: { traffic: 1, climate: 1, health: 1, environment: 1, population: 1 },
};
