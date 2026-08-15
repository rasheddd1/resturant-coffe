import React from 'react';

export function PageError({ error, onRetry }) {
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  return (
    <div className="card card-pad page-error-state" role="alert">
      <div className="page-error-icon">{offline ? '📡' : '⚠️'}</div>
      <h3>{offline ? 'لا يوجد اتصال بالإنترنت' : 'تعذر تحميل البيانات'}</h3>
      <p>{offline ? 'اتصل بالإنترنت ثم اضغط إعادة المحاولة.' : 'لم يتم تحميل بيانات هذا القسم. جرّب مرة أخرى، وإذا استمر الخطأ راجع اتصال قاعدة البيانات.'}</p>
      {error?.message && <small className="text-muted page-error-detail">{error.message}</small>}
      <button className="btn btn-primary" onClick={onRetry}>إعادة المحاولة</button>
    </div>
  );
}
