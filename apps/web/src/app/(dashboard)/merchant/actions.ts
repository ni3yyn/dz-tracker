'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseAdminClient } from '@saas/database';

export async function saveStatusMapping(formData: FormData) {
  const merchantId = formData.get('merchant_id') as string;
  const sourceStatus = (formData.get('source_status') as string)?.trim().toLowerCase();
  const displayStatus = (formData.get('display_status') as string)?.trim();

  if (!merchantId || !sourceStatus || !displayStatus) {
    return { error: 'يرجى ملء جميع الحقول المطلوبة' };
  }

  const supabase = getSupabaseAdminClient();

  // إدخال أو تحديث المطابقة بناءً على (merchant_id + source_status)
  const { error } = await supabase
    .from('status_mappings')
    .upsert(
      {
        merchant_id: merchantId,
        source_status: sourceStatus,
        display_status: displayStatus,
      },
      { onConflict: 'merchant_id, source_status' }
    );

  if (error) {
    console.error('Error saving mapping:', error);
    return { error: 'حدث خطأ أثناء حفظ المطابقة' };
  }

  // تحديث كاش الصفحة فوراً في Next.js
  revalidatePath('/merchant');
  return { success: true };
}

export async function updateOrderStatus(formData: FormData) {
  const orderId = formData.get('order_id') as string;
  const newStatus = formData.get('status') as string;
  const description = formData.get('description') as string || '';

  if (!orderId || !newStatus) return { error: 'بيانات غير مكتملة' };

  const supabase = getSupabaseAdminClient();

  // 1. تحديث الحالة الحالية في جدول الطلبات
  const { data: order, error: updateError } = await supabase
    .from('orders')
    .update({
      current_status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .select('merchant_id')
    .single();

  if (updateError || !order) {
    return { error: 'فشل تحديث الطلب' };
  }

  // 2. البحث عن المسمى المعروض بناءً على إعدادات التاجر
  const { data: mapping } = await supabase
    .from('status_mappings')
    .select('display_status')
    .eq('merchant_id', order.merchant_id)
    .eq('source_status', newStatus)
    .maybeSingle();

  const titleMap: Record<string, string> = {
    order_placed: 'تم استلام الطلب 📝',
    processing: 'قيد التجهيز في المستودع 📦',
    shipped: 'خرج للتوصيل مع المندوب 🚚',
    delivered: 'تم التسليم بنجاح ✅',
    cancelled: 'تم إلغاء الطلب ❌',
  };

  const statusTitle = mapping?.display_status || titleMap[newStatus] || newStatus;

  // 3. إضافة التحديث للسجل الزمني (Timeline)
  await supabase.from('order_history').insert({
    order_id: orderId,
    status_raw: newStatus,
    status_title: statusTitle,
    description: description || null,
  });

  revalidatePath('/merchant');
  return { success: true };
}