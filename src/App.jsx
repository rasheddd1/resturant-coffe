import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth.js';
import { BranchProvider } from './hooks/useBranch.jsx';
import { canAccess, defaultRouteFor } from './lib/permissions.js';
import AppShell from './components/AppShell.jsx';
import Login from './pages/Login.jsx';
import Overview from './pages/Overview.jsx';
import Cashier from './pages/Cashier.jsx';
import SalesReports from './pages/SalesReports.jsx';
import Customers from './pages/Customers.jsx';
import Products from './pages/Products.jsx';
import Inventory from './pages/Inventory.jsx';
import RawMaterials from './pages/RawMaterials.jsx';
import Accounting from './pages/Accounting.jsx';
import BranchComparison from './pages/BranchComparison.jsx';
import Users from './pages/Users.jsx';
import Activity from './pages/Activity.jsx';
import Suppliers from './pages/Suppliers.jsx';
import Purchases from './pages/Purchases.jsx';
import DeliveryDrivers from './pages/DeliveryDrivers.jsx';
import CashShifts from './pages/CashShifts.jsx';

// Blocks direct navigation (typed URL, refresh, stale link) to a route the
// current role isn't allowed to open, redirecting to that role's default page.
function Guarded({ profile, children }) {
  const location = useLocation();
  if (!canAccess(location.pathname, profile.role)) {
    return <Navigate to={defaultRouteFor(profile.role)} replace />;
  }
  return children;
}

export default function App() {
  const { loading, profile, deniedReason, refresh, logout } = useAuth();

  if (loading) {
    return <div className="page-loader"><div className="spinner" /></div>;
  }

  if (!profile) {
    return <Login deniedReason={deniedReason} onLoggedIn={refresh} />;
  }

  return (
    <BranchProvider profile={profile}>
      <Routes>
        <Route path="/" element={<AppShell profile={profile} onLogout={logout} />}>
          <Route index element={<Guarded profile={profile}><Overview /></Guarded>} />
          <Route path="cashier" element={<Guarded profile={profile}><Cashier profile={profile} /></Guarded>} />
          <Route path="sales" element={<Guarded profile={profile}><SalesReports /></Guarded>} />
          <Route path="customers" element={<Guarded profile={profile}><Customers /></Guarded>} />
          <Route path="products" element={<Guarded profile={profile}><Products /></Guarded>} />
          <Route path="inventory" element={<Guarded profile={profile}><Inventory profile={profile} /></Guarded>} />
          <Route path="raw-materials" element={<Guarded profile={profile}><RawMaterials profile={profile} /></Guarded>} />
          <Route path="accounting" element={<Guarded profile={profile}><Accounting profile={profile} /></Guarded>} />
          <Route path="branches" element={<Guarded profile={profile}><BranchComparison /></Guarded>} />
          <Route path="users" element={<Guarded profile={profile}><Users currentProfile={profile} /></Guarded>} />
          <Route path="activity" element={<Guarded profile={profile}><Activity /></Guarded>} />
          <Route path="suppliers" element={<Guarded profile={profile}><Suppliers profile={profile} /></Guarded>} />
          <Route path="purchases" element={<Guarded profile={profile}><Purchases profile={profile} /></Guarded>} />
          <Route path="delivery-drivers" element={<Guarded profile={profile}><DeliveryDrivers /></Guarded>} />
          <Route path="cash-shifts" element={<Guarded profile={profile}><CashShifts profile={profile} /></Guarded>} />
          <Route path="*" element={<Navigate to={defaultRouteFor(profile.role)} replace />} />
        </Route>
      </Routes>
    </BranchProvider>
  );
}
