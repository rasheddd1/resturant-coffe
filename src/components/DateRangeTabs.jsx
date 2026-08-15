import React from 'react';

export default function DateRangeTabs({ range, onChange, customFrom, customTo, onCustomChange, onApplyCustom }) {
  return (
    <div className="flex gap-8 flex-wrap items-center" style={{ marginBottom: 16 }}>
      <div className="pill-row">
        <button className={`pill ${range === 'today' ? 'active' : ''}`} onClick={() => onChange('today')}>اليوم</button>
        <button className={`pill ${range === 'month' ? 'active' : ''}`} onClick={() => onChange('month')}>هذا الشهر</button>
        <button className={`pill ${range === 'custom' ? 'active' : ''}`} onClick={() => onChange('custom')}>فترة مخصصة</button>
      </div>
      {range === 'custom' && (
        <div className="flex gap-8 items-center flex-wrap">
          <input type="date" className="input" style={{ padding: '6px 10px', width: 150 }} value={customFrom} onChange={(e) => onCustomChange('from', e.target.value)} />
          <input type="date" className="input" style={{ padding: '6px 10px', width: 150 }} value={customTo} onChange={(e) => onCustomChange('to', e.target.value)} />
          <button className="btn btn-sm btn-primary" onClick={onApplyCustom}>تطبيق</button>
        </div>
      )}
    </div>
  );
}
