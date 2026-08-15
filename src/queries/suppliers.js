import { supabase } from '../lib/supabase.js';

export async function listSuppliers({search='', branchId=null}={}) {
  let q=supabase.from('suppliers').select('*, branches(name)').order('name');
  if(branchId) q=q.eq('branch_id',branchId);
  if(search) q=q.ilike('name',`%${search}%`);
  const {data,error}=await q; if(error) throw error; return data||[];
}
export async function createSupplier(payload){const {data,error}=await supabase.from('suppliers').insert(payload).select().single();if(error)throw error;return data;}
export async function updateSupplier(id,payload){const {data,error}=await supabase.from('suppliers').update(payload).eq('id',id).select().single();if(error)throw error;return data;}
export async function deleteSupplier(id){const {error}=await supabase.from('suppliers').delete().eq('id',id);if(error)throw error;}
export async function adjustSupplierBalance(id,amount){const {data,error}=await supabase.rpc('adjust_supplier_balance',{p_supplier_id:id,p_amount:Number(amount)});if(error){const {data:s,error:e}=await supabase.from('suppliers').select('balance').eq('id',id).single();if(e)throw e;const r=await supabase.from('suppliers').update({balance:Number(s.balance||0)+Number(amount)}).eq('id',id).select().single();if(r.error)throw r.error;return r.data;}return data;}
export async function listSupplierPayments(supplierId){const {data,error}=await supabase.from('supplier_payments').select('*, profiles(full_name)').eq('supplier_id',supplierId).order('created_at',{ascending:false});if(error)throw error;return data||[];}
export async function paySupplier({supplierId,branchId,amount,method='cash',note='',createdBy}) {
  const a=Number(amount); if(!(a>0)) throw new Error('INVALID_AMOUNT');
  const {data:s,error:se}=await supabase.from('suppliers').select('balance').eq('id',supplierId).single();if(se)throw se;
  if(a>Number(s.balance||0)) throw new Error('PAYMENT_EXCEEDS_BALANCE');
  const {data,error}=await supabase.from('supplier_payments').insert({supplier_id:supplierId,branch_id:branchId,amount:a,method,note:note||null,created_by:createdBy}).select().single();if(error)throw error;
  await adjustSupplierBalance(supplierId,-a); return data;
}

export async function getSupplierStatement(supplierId){
  const payments = await listSupplierPayments(supplierId);
  const entries = payments.map((payment)=>({type:'payment',date:payment.created_at,ref:null,debit:0,credit:Number(payment.amount||0),note:payment.note})).sort((a,b)=>new Date(a.date)-new Date(b.date));
  let running=0;
  for(const entry of entries){running += entry.debit-entry.credit; entry.balance=running;}
  return entries.reverse();
}

export async function addSupplierPayment({supplierId,branchId,amount,paymentMethod='cash',method,note,createdBy}){
  const a=Number(amount); if(!(a>0)) throw new Error('invalid_payment_amount');
  const {data:s,error:se}=await supabase.from('suppliers').select('balance').eq('id',supplierId).single(); if(se) throw se;
  if(a>Number(s.balance||0)) throw new Error('PAYMENT_EXCEEDS_BALANCE');
  const {data,error}=await supabase.from('supplier_payments').insert({supplier_id:supplierId,branch_id:branchId,amount:a,method:paymentMethod||method||'cash',note:note||null,txn_date:new Date().toISOString().slice(0,10),created_by:createdBy}).select().single(); if(error) throw error;
  const next=Number(s.balance||0)-a; const {error:be}=await supabase.from('suppliers').update({balance:next}).eq('id',supplierId); if(be) throw be;
  return data;
}
