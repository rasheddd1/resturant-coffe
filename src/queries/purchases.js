import { supabase } from '../lib/supabase.js';
import { adjustSupplierBalance } from './suppliers.js';

export async function listPurchases({supplierId=null,branchId=null}={}) {
  let q=supabase.from('purchases').select('*, suppliers(name), branches(name), profiles(full_name)').order('created_at',{ascending:false});
  if(supplierId)q=q.eq('supplier_id',supplierId); if(branchId)q=q.eq('branch_id',branchId);
  const {data,error}=await q;if(error)throw error;return data||[];
}
export async function getPurchaseDetails(id){const a=await supabase.from('purchases').select('*, suppliers(name,phone), branches(name), profiles(full_name)').eq('id',id).single();if(a.error)throw a.error;const b=await supabase.from('purchase_items').select('*').eq('purchase_id',id);if(b.error)throw b.error;return {purchase:a.data,items:b.data||[]};}
export async function createPurchase({branchId,supplierId,items,paidAmount=0,paymentMethod='cash',notes,createdBy}){
 if(!items?.length)throw new Error('EMPTY_ITEMS'); const total=items.reduce((s,i)=>s+Number(i.quantity)*Number(i.unitCost),0);
 const invoice=`PUR-${new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14)}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
 const {data:p,error:pe}=await supabase.from('purchases').insert({invoice_number:invoice,supplier_id:supplierId,branch_id:branchId,subtotal:total,total,paid_amount:Number(paidAmount)||0,payment_method:paymentMethod,notes:notes||null,created_by:createdBy}).select().single();if(pe)throw pe;
 const rows=items.map(i=>({purchase_id:p.id,item_type:'product',branch_id:branchId,product_id:i.productId,product_name:i.productName,quantity:Number(i.quantity),unit_cost:Number(i.unitCost),total:Number(i.quantity)*Number(i.unitCost)}));
 const {error:ie}=await supabase.from('purchase_items').insert(rows);if(ie)throw ie;
 for(const i of rows){const {data:pr,error:e}=await supabase.from('products').select('stock_quantity').eq('id',i.product_id).single();if(e)throw e;const stock=Number(pr.stock_quantity||0)+Number(i.quantity);const u=await supabase.from('products').update({stock_quantity:stock}).eq('id',i.product_id);if(u.error)throw u.error;await supabase.from('inventory_movements').insert({product_id:i.product_id,type:'in',quantity:Number(i.quantity),reason:'شراء - فاتورة مشتريات',created_by:createdBy||null,branch_id:branchId});}
 const remaining=total-(Number(paidAmount)||0);if(remaining)await adjustSupplierBalance(supplierId,remaining);return p;
}
export async function cancelPurchase(id){
 const {data:p,error:pe}=await supabase.from('purchases').select('*').eq('id',id).single();if(pe)throw pe;if(p.status==='cancelled')throw new Error('ALREADY_CANCELLED');
 const {data:items,error:ie}=await supabase.from('purchase_items').select('*').eq('purchase_id',id);if(ie)throw ie;
 for(const i of items||[]){if(!i.product_id)continue;const {data:pr}=await supabase.from('products').select('stock_quantity').eq('id',i.product_id).single();if(pr){const u=await supabase.from('products').update({stock_quantity:Math.max(Number(pr.stock_quantity)-Number(i.quantity),0)}).eq('id',i.product_id);if(u.error)throw u.error;}await supabase.from('inventory_movements').insert({product_id:i.product_id,type:'out',quantity:-Number(i.quantity),reason:'إلغاء فاتورة مشتريات',branch_id:i.branch_id});}
 const remaining=Number(p.total)-Number(p.paid_amount);if(remaining)await adjustSupplierBalance(p.supplier_id,-remaining);
 const {error}=await supabase.from('purchases').update({status:'cancelled'}).eq('id',id);if(error)throw error;
}
