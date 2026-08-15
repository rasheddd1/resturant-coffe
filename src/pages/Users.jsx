import React, { useEffect, useState, useCallback } from 'react';
import { listProfiles, updateProfileRole, setProfileActive, updateProfileBranch } from '../queries/users.js';
import { useBranch } from '../hooks/useBranch.jsx';
import { PageError } from '../components/AsyncState.jsx';

const ROLE_LABELS = { admin: 'مدير', manager: 'مشرف', cashier: 'كاشير' };

export default function Users({ currentProfile }) {
  const isAdmin = currentProfile?.role === 'admin';
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { branches } = useBranch();

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // managers only ever see accounts belonging to their own branch
      const data = await listProfiles(isAdmin ? null : currentProfile?.branch_id);
      setProfiles(data);
    } catch (err) { console.error('[Users]', err); setError(err); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, currentProfile?.branch_id]);

  useEffect(() => { load(); }, [load]);

  async function handleRoleChange(id, role) {
    await updateProfileRole(id, role);
    load();
  }

  async function handleBranchChange(id, branchId) {
    await updateProfileBranch(id, branchId || null);
    load();
  }

  async function handleToggleActive(id, isActive) {
    await setProfileActive(id, !isActive);
    load();
  }

  if (loading && !profiles.length) return <div className="page-loader"><div className="spinner" /></div>;
  if (error && !profiles.length) return <PageError error={error} onRetry={load} />;

  // read-only, branch-scoped view for managers: just each user and their branch
  if (!isAdmin) {
    return (
      <div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>الاسم</th>
                <th>الدور</th>
                <th>الفرع</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.full_name || '—'}</strong>
                    {p.id === currentProfile?.id && <span className="badge badge-muted" style={{ marginInlineStart: 8 }}>أنت</span>}
                  </td>
                  <td>{ROLE_LABELS[p.role] || p.role}</td>
                  <td>{p.branches?.name || '—'}</td>
                  <td>
                    <span className={`badge ${p.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {p.is_active ? 'مفعل' : 'موقوف'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {profiles.length === 0 && <div className="table-empty">لا توجد بيانات</div>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="card card-pad" style={{ marginBottom: 16, background: 'var(--color-primary-light)', border: 'none' }}>
        <p style={{ fontSize: 13.5 }}>ℹ️ لإنشاء مستخدم جديد استخدم Supabase Dashboard (Authentication → Users)، ثم حدّد دوره وفرعه من هنا.</p>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الدور</th>
              <th>الفرع المخصص</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.full_name || '—'}</strong>
                  {p.id === currentProfile?.id && <span className="badge badge-muted" style={{ marginInlineStart: 8 }}>أنت</span>}
                </td>
                <td>
                  <select
                    className="input"
                    style={{ padding: '6px 10px', width: 120 }}
                    value={p.role}
                    disabled={p.id === currentProfile?.id}
                    onChange={(e) => handleRoleChange(p.id, e.target.value)}
                  >
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </td>
                <td>
                  {p.role === 'admin' ? (
                    <span className="text-muted">كل الفروع</span>
                  ) : (
                    <select
                      className="input"
                      style={{ padding: '6px 10px', width: 140 }}
                      value={p.branch_id || ''}
                      disabled={p.id === currentProfile?.id}
                      onChange={(e) => handleBranchChange(p.id, e.target.value)}
                    >
                      <option value="">غير مخصص</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  )}
                </td>
                <td>
                  <span className={`badge ${p.is_active ? 'badge-success' : 'badge-danger'}`}>
                    {p.is_active ? 'مفعل' : 'موقوف'}
                  </span>
                </td>
                <td>
                  {p.id !== currentProfile?.id && (
                    <button className="btn btn-ghost btn-sm" onClick={() => handleToggleActive(p.id, p.is_active)}>
                      {p.is_active ? 'إيقاف' : 'تفعيل'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {profiles.length === 0 && <div className="table-empty">لا توجد بيانات</div>}
      </div>
    </div>
  );
}
