export const ROLES = ['admin', 'manager', 'cashier'];

export const ROLE_LABELS = { admin: 'مدير', manager: 'مشرف', cashier: 'كاشير' };

// which roles can open which route of the admin dashboard
const PAGE_ACCESS = {
  '/': ['admin', 'manager'],
  '/cashier': ['admin', 'manager', 'cashier'],
  '/sales': ['admin', 'manager'],
  '/customers': ['admin', 'manager', 'cashier'],
  '/products': ['admin', 'manager'],
  '/inventory': ['admin', 'manager'],
  '/raw-materials': ['admin', 'manager'],
  '/accounting': ['admin', 'manager'],
  '/branches': ['admin'],
  '/users': ['admin', 'manager'],
  '/activity': ['admin'],
  '/suppliers': ['admin','manager'],
  '/purchases': ['admin','manager'],
  '/delivery-drivers': ['admin','manager'],
  '/cash-shifts': ['admin','manager']
};

export function canAccess(path, role) {
  return (PAGE_ACCESS[path] || []).includes(role);
}

// first route each role lands on / gets redirected to when denied a page
export function defaultRouteFor(role) {
  return role === 'cashier' ? '/cashier' : '/';
}
