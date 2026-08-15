import { useEffect, useState, useCallback } from 'react';
import { getSession, getCurrentProfile, logout as doLogout, onAuthStateChange } from '../lib/auth.js';
import { ROLES } from '../lib/permissions.js';

export function useAuth() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [deniedReason, setDeniedReason] = useState(null);

  const loadProfile = useCallback(async () => {
    const session = await getSession();
    if (!session) {
      setProfile(null);
      setDeniedReason(null);
      setLoading(false);
      return;
    }
    const p = await getCurrentProfile();
    if (!p) {
      setProfile(null);
      setDeniedReason('لم يتم العثور على بيانات هذا المستخدم');
      setLoading(false);
      return;
    }
    if (!ROLES.includes(p.role)) {
      await doLogout();
      setProfile(null);
      setDeniedReason('هذا الحساب ليس لديه صلاحية معروفة للدخول على اللوحة.');
      setLoading(false);
      return;
    }
    if (p.role !== 'admin' && !p.branch_id) {
      await doLogout();
      setProfile(null);
      setDeniedReason('لم يتم تخصيص فرع لهذا الحساب بعد، يرجى التواصل مع الإدارة.');
      setLoading(false);
      return;
    }
    if (p.is_active === false) {
      await doLogout();
      setProfile(null);
      setDeniedReason('هذا الحساب موقوف، يرجى التواصل مع الإدارة.');
      setLoading(false);
      return;
    }
    setProfile(p);
    setDeniedReason(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadProfile();
    const sub = onAuthStateChange(() => loadProfile());
    return () => sub?.unsubscribe();
  }, [loadProfile]);

  const logout = useCallback(async () => {
    await doLogout();
    setProfile(null);
  }, []);

  return { loading, profile, deniedReason, refresh: loadProfile, logout };
}
