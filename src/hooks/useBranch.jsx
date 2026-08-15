import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { listBranches } from '../queries/branches.js';

export const ALL_BRANCHES = '__all__';
const BranchCtx = createContext({ branchId: null, branches: [], selected: ALL_BRANCHES, setSelected: () => {}, locked: false });

export function BranchProvider({ profile, children }) {
  const [branches, setBranches] = useState([]);
  const [branchLoadError, setBranchLoadError] = useState(null);
  // non-admin accounts are pinned to their own branch and can't switch
  const locked = profile?.role !== 'admin';
  const [selected, setSelectedState] = useState(() => {
    if (locked) return profile?.branch_id || ALL_BRANCHES;
    return localStorage.getItem('pos-admin-dashboard-branch') || ALL_BRANCHES;
  });

  const load = useCallback(async () => {
    try {
      setBranchLoadError(null);
      setBranches(await listBranches({ onlyActive: true }));
    } catch (err) {
      console.error('[Branches]', err);
      setBranchLoadError(err);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // keep selection pinned even if profile loads/changes after mount
  useEffect(() => {
    if (locked) setSelectedState(profile?.branch_id || ALL_BRANCHES);
  }, [locked, profile?.branch_id]);

  function setSelected(id) {
    if (locked) return; // non-admin accounts can't change branch
    setSelectedState(id);
    localStorage.setItem('pos-admin-dashboard-branch', id);
  }

  const branchId = selected === ALL_BRANCHES ? null : selected;

  return (
    <BranchCtx.Provider value={{ branchId, selected, branches, setSelected, reloadBranches: load, locked, branchLoadError }}>
      {children}
    </BranchCtx.Provider>
  );
}

export function useBranch() {
  return useContext(BranchCtx);
}
