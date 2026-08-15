import React from 'react';

export default function StatCard({ icon, label, value, accent }) {
  return (
    <div className="stat-card" style={accent ? { background: accent.bg } : undefined}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value mono-num" style={accent ? { color: accent.text } : undefined}>
        {value}
      </div>
    </div>
  );
}
