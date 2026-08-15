import React,{useEffect,useRef} from 'react';
import { useBranch } from '../hooks/useBranch.jsx';
import { renderSuppliers } from '../legacy/suppliers.js';

export default function Suppliers({profile}){
  const {branchId}=useBranch();
  const ref=useRef(null);
  useEffect(()=>{
    let active=true; let cleanup=()=>{};
    (async()=>{
      if(!ref.current) return;
      try { cleanup=await renderSuppliers(ref.current,profile,branchId); }
      catch(e){ if(active&&ref.current) ref.current.innerHTML=`<div class="page-error-state"><div class="page-error-icon">⚠️</div><h3>تعذر تحميل الموردين</h3><p>${e?.message||'حدث خطأ غير متوقع'}</p><button class="btn btn-primary" onclick="location.reload()">إعادة المحاولة</button></div>`; }
    })();
    return()=>{active=false;try{cleanup?.()}catch{} if(ref.current)ref.current.innerHTML='';};
  },[profile,branchId]);
  return <div ref={ref}/>;
}
