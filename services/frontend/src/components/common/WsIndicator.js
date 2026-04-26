const WsIndicator = ({ connected }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
    fontSize: 12, color: connected ? '#4caf50' : '#aaa' }}>
    <span style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
      backgroundColor: connected ? '#4caf50' : '#aaa' }} />
    {connected ? 'Real-time connected' : 'Connecting…'}
  </span>
);

export default WsIndicator;
