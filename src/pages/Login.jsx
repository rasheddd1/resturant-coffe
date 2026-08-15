import React, { useState } from 'react';
import { login } from '../lib/auth.js';

const iconUser = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>;
const iconLock = <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>;
const iconEye = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Z"/><circle cx="12" cy="12" r="2.4"/></svg>;
const iconEyeOff = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c6 0 9.5 7 9.5 7a18 18 0 0 1-3.2 3.8M6.3 6.3C3.8 8.1 2.5 12 2.5 12s3.5 7 9.5 7c1.4 0 2.7-.3 3.9-.9"/></svg>;
const iconStore = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16v10H4z"/><path d="M3 10 5 5h14l2 5"/><path d="M7 10v2.2M12 10v2.2M17 10v2.2"/></svg>;
const iconCloche = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17h16M6 17c0-5 2.2-8 6-8s6 3 6 8M10 6.5c.5-1.4 1.5-2.1 2-2.1s1.5.7 2 2.1"/><path d="M11 4.1h2"/></svg>;

export default function Login({ deniedReason, onLoggedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState(deniedReason || '');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError('يرجى تعبئة جميع الحقول');
      return;
    }
    setLoading(true);
    try {
      await login(cleanEmail, password);
      if (remember) localStorage.setItem('pos-admin-remember', '1');
      else localStorage.removeItem('pos-admin-remember');
      onLoggedIn();
    } catch (err) {
      const offline = err?.code === 'offline_first_login_required';
      const network = /fetch|network|timeout|failed to fetch/i.test(err?.message || '');
      setError(offline ? 'يجب تسجيل الدخول أولاً أثناء الاتصال بالإنترنت.' : network ? 'تعذر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.' : 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-target" dir="rtl">
      <div className="login-target-bg" aria-hidden="true" />
      <div className="login-target-overlay" aria-hidden="true" />
      <main className="login-target-main">
        <section className="login-target-card" aria-label="تسجيل الدخول">
          <div className="login-target-cloche">{iconCloche}</div>
          <div className="login-target-heading">
            <h1>مرحباً بك</h1>
            <p>يرجى تسجيل الدخول لمتابعة العمل</p>
          </div>
          <div className="login-target-error-slot">
            {error && <div className="login-target-error"><span>!</span><div>{error}</div></div>}
            {info && <div className="login-target-info">{info}</div>}
          </div>
          <form className="login-target-form" onSubmit={handleSubmit} autoComplete="on">
            <div className="login-target-field">
              <label htmlFor="login-email">اسم المستخدم</label>
              <div className="login-target-input-wrap">
                <span className="login-target-field-icon">{iconUser}</span>
                <input id="login-email" name="email" type="email" autoComplete="username" placeholder="أدخل اسم المستخدم" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
            </div>
            <div className="login-target-field">
              <label htmlFor="login-password">كلمة المرور</label>
              <div className="login-target-input-wrap">
                <span className="login-target-field-icon">{iconLock}</span>
                <input id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="أدخل كلمة المرور" value={password} onChange={(e) => setPassword(e.target.value)} required />
                <button className="login-target-eye" type="button" aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} onClick={() => setShowPassword((v) => !v)}>{showPassword ? iconEyeOff : iconEye}</button>
              </div>
            </div>
            <div className="login-target-options">
              <label className="login-target-remember" htmlFor="remember-login">
                <input id="remember-login" type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                <span>تذكرني</span>
              </label>
              <button className="login-target-forgot" type="button" onClick={() => { setError(''); setInfo('لإعادة كلمة المرور، يرجى التواصل مع مدير النظام.'); }}>نسيت كلمة المرور؟</button>
            </div>
            <button className="login-target-submit" type="submit" disabled={loading}>
              <span>{loading ? 'جارٍ تسجيل الدخول...' : 'تسجيل الدخول'}</span>
              {loading ? <span className="login-target-spinner" aria-hidden="true" /> : <span className="login-target-submit-arrow" aria-hidden="true">→</span>}
            </button>
          </form>
          <div className="login-target-or"><span /><b>أو</b><span /></div>
          <button className="login-target-employee" type="button" onClick={() => { setError(''); setInfo('أدخل بيانات حساب الموظف ثم سجّل الدخول.'); document.getElementById('login-email')?.focus(); }}>
            <span className="login-target-store">{iconStore}</span>
            <span>الدخول كموظف</span>
          </button>
        </section>
      </main>
      <footer className="login-target-footer">
        <div className="login-target-footer-logo"><span className="footer-mark">10</span><span>ONE O ONE</span><small>RESTAURANT &amp; CAFE</small></div>
        <div className="login-target-footer-copy">© 2026 جميع الحقوق محفوظة</div>
        <div className="login-target-footer-credit" dir="ltr"><strong>Rashed Agency</strong><span>Designed &amp; Developed By</span><span>☎ 01146250221 | 01017661887</span></div>
      </footer>
    </div>
  );
}
