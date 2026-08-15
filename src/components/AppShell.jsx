import React, { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useBranch, ALL_BRANCHES } from '../hooks/useBranch.jsx';
import { canAccess, ROLE_LABELS } from '../lib/permissions.js';
import brandLogo from '../assets/login-brand.png';
import ErrorBoundary from './ErrorBoundary.jsx';

const NAV_GROUPS = [
  { id: 'overview', route: '/', icon: '📊', label: 'نظرة عامة', end: true },
  { id: 'sales', icon: '🧾', label: 'المبيعات', routes: [
    { path: '/cashier', icon: '🧾', label: 'الكاشير' },
    { path: '/sales', icon: '📈', label: 'تقارير المبيعات' },
    { path: '/customers', icon: '👥', label: 'العملاء' }
  ]},
  { id: 'inventory', icon: '📦', label: 'المخزون', routes: [
    { path: '/products', icon: '📦', label: 'المنتجات' },
    { path: '/raw-materials', icon: '🧂', label: 'المواد الخام' },
    { path: '/inventory', icon: '📉', label: 'إدارة المخزون' }
  ]},
  { id: 'finance', icon: '💰', label: 'الحسابات والمشتريات', routes: [
    { path: '/accounting', icon: '💰', label: 'الحسابات' },
    { path: '/suppliers', icon: '🏭', label: 'الموردون' },
    { path: '/purchases', icon: '🧾', label: 'فواتير المشتريات' },
    { path: '/cash-shifts', icon: '💵', label: 'جرد الشيفت' }
  ]},
  { id: 'delivery', route: '/delivery-drivers', icon: '🛵', label: 'مناديب الدليفري' },
  { id: 'admin', icon: '⚙️', label: 'الإدارة', routes: [
    { path: '/branches', icon: '🏬', label: 'مقارنة الفروع' },
    { path: '/users', icon: '🧑‍💼', label: 'المستخدمون' },
    { path: '/activity', icon: '🕒', label: 'آخر الأنشطة' }
  ]}
];

const TITLES = Object.fromEntries([
  ['/', 'نظرة عامة'], ['/cashier', 'الكاشير'], ['/sales', 'تقارير المبيعات'], ['/customers', 'العملاء'],
  ['/products', 'المنتجات'], ['/raw-materials', 'المواد الخام'], ['/inventory', 'إدارة المخزون'], ['/accounting', 'الحسابات'],
  ['/suppliers', 'الموردون'], ['/purchases', 'فواتير المشتريات'], ['/cash-shifts', 'جرد الشيفت'], ['/branches', 'مقارنة الفروع'],
  ['/users', 'المستخدمون'], ['/delivery-drivers', 'مناديب الدليفري'], ['/activity', 'آخر الأنشطة']
]);

function groupItems(group, role) {
  if (group.route) return canAccess(group.route, role) ? [{ ...group, path: group.route }] : [];
  return group.routes.filter((item) => canAccess(item.path, role));
}

export default function AppShell({ profile, onLogout }) {
  const location = useLocation();
  const { branches, selected, setSelected, locked } = useBranch();
  const [moreOpen, setMoreOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('admin-sidebar-collapsed') === '1');
  const [openGroups, setOpenGroups] = useState(() => {
    const saved = {};
    NAV_GROUPS.forEach((g) => {
      if (g.routes) saved[g.id] = localStorage.getItem(`admin-nav-${g.id}`) !== '0';
    });
    return saved;
  });

  const groups = useMemo(() => NAV_GROUPS.map((g) => ({ ...g, items: groupItems(g, profile.role) })).filter((g) => g.items.length), [profile.role]);
  const title = TITLES[location.pathname] || 'لوحة التحكم';
  const flatItems = groups.flatMap((g) => g.items);
  const bottomMain = flatItems.filter((item) => ['/','/cashier','/sales','/customers'].includes(item.path)).slice(0, 4);
  const bottomMore = flatItems.filter((item) => !bottomMain.some((x) => x.path === item.path));
  const isMoreActive = bottomMore.some((item) => location.pathname === item.path);

  function toggleGroup(id) {
    setOpenGroups((prev) => {
      const next = !prev[id];
      localStorage.setItem(`admin-nav-${id}`, next ? '1' : '0');
      return { ...prev, [id]: next };
    });
  }

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem('admin-sidebar-collapsed', next ? '1' : '0');
      return next;
    });
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''}`}>
        <div className="sidebar-brand">
          <img className="brand-mark-image" src={brandLogo} alt="101 Coffee" />
          <div className="brand-text">لوحة التحكم</div>
          <button className="sidebar-collapse-btn" type="button" onClick={toggleCollapsed} title={collapsed ? 'توسيع القائمة' : 'طي القائمة'}>{collapsed ? '›' : '‹'}</button>
        </div>
        <nav className="sidebar-nav">
          {groups.map((group) => {
            const active = group.items.some((item) => location.pathname === item.path);
            if (!group.routes) {
              const item = group.items[0];
              return <NavLink key={group.id} to={item.path} end={item.end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><span className="nav-icon">{item.icon}</span><span className="nav-label">{item.label}</span></NavLink>;
            }
            const isOpen = openGroups[group.id] ?? active;
            return (
              <div className={`nav-group ${active ? 'has-active' : ''} ${isOpen ? 'is-open' : ''}`} key={group.id}>
                <button className={`nav-group-toggle ${active ? 'active' : ''}`} type="button" onClick={() => toggleGroup(group.id)} aria-expanded={isOpen}>
                  <span className="nav-group-main"><span className="nav-icon">{group.icon}</span><span className="nav-label">{group.label}</span></span>
                  <span className="nav-chevron">⌄</span>
                </button>
                {isOpen && <div className="nav-submenu">{group.items.map((item) => <NavLink key={item.path} to={item.path} className={({ isActive }) => `nav-item nav-subitem ${isActive ? 'active' : ''}`}><span className="nav-icon">{item.icon}</span><span className="nav-label">{item.label}</span></NavLink>)}</div>}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user"><div className="avatar">{(profile?.full_name || '؟').charAt(0)}</div><div><div className="u-name">{profile?.full_name || ''}</div><div className="u-role">{ROLE_LABELS[profile.role] || profile.role}</div></div></div>
          <button className="nav-item" onClick={onLogout}><span className="nav-icon">🚪</span><span className="nav-label">تسجيل الخروج</span></button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-title-wrap"><h1>{title}</h1></div>
          <div className="flex items-center gap-12 topbar-actions">
            {locked ? <span className="badge badge-muted">🏬 {branches.find((b) => b.id === selected)?.name || 'الفرع المخصص'}</span> : <select className="input branch-select" value={selected} onChange={(e) => setSelected(e.target.value)}><option value={ALL_BRANCHES}>كل الفروع</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
            <button className="btn btn-ghost btn-sm" onClick={onLogout}>🚪 خروج</button>
          </div>
        </header>
        <div className="content-scroll"><ErrorBoundary><Outlet /></ErrorBoundary></div>
      </div>

      <nav className="bottom-nav">
        {bottomMain.map((item) => <NavLink key={item.path} to={item.path} end={item.path === '/'} className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}><span className="bn-icon">{item.icon}</span><span>{item.label}</span></NavLink>)}
        <button className={`bottom-nav-item ${isMoreActive ? 'active' : ''}`} onClick={() => setMoreOpen(true)}><span className="bn-icon">⋯</span><span>المزيد</span></button>
      </nav>
      {moreOpen && <div className="more-sheet-overlay" onClick={() => setMoreOpen(false)}><div className="more-sheet" onClick={(e) => e.stopPropagation()}>{[...bottomMore, { path: '__logout', icon: '🚪', label: 'خروج' }].map((item) => item.path === '__logout' ? <button key="logout" className="more-sheet-item" onClick={onLogout}><span className="ms-icon">{item.icon}</span><span>{item.label}</span></button> : <NavLink key={item.path} to={item.path} className="more-sheet-item" onClick={() => setMoreOpen(false)}><span className="ms-icon">{item.icon}</span><span>{item.label}</span></NavLink>)}</div></div>}
    </div>
  );
}
