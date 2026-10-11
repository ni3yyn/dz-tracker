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

// 1. حذف مطابقة حالة
export async function deleteStatusMapping(formData: FormData) {
  const id = formData.get('id') as string;
  if (!id) return { error: 'Missing mapping ID' };

  const supabase = getSupabaseAdminClient();
  await supabase.from('status_mappings').delete().eq('id', id);

  revalidatePath('/merchant');
  return { success: true };
}

// 2. تطبيق حزم القوالب الجاهزة بنقرة واحدة (شوبيفاي أو ياليدين)
export async function applyPresetMappings(formData: FormData) {
  const merchantId = formData.get('merchant_id') as string;
  const presetType = formData.get('preset_type') as string;

  if (!merchantId || !presetType) return { error: 'بيانات غير مكتملة' };

  const supabase = getSupabaseAdminClient();

  // 1. قوالب ياليدين الميدانية
  const yalidinePresets = [
    { source_status: 'en_preparation', display_status: 'تم تسجيل الشحنة وجاري تجهيزها 📦' },
    { source_status: 'vers_wilaya', display_status: 'الشحنة في الطريق إلى ولايتك عبر خط النقل السريع 🚛' },
    { source_status: 'centre', display_status: 'وصلت إلى مركز التوزيع المحلي في ولايتك 📍' },
    { source_status: 'stopdesk', display_status: 'جاهز للاستلام من مكتب ياليدين في ولايتك 🏢' },
    { source_status: 'sorti_en_livraison', display_status: 'خرج للتوصيل مع المندوب اليوم، يرجى الانتباه لهاتفك 🛵' },
    { source_status: 'tentative_echouee', display_status: 'تنبيه: حاول المندوب الاتصال بك ولم يتم الرد ⚠️' },
    { source_status: 'injoignable', display_status: 'تنبيه: هاتفك غير متاح لشبكة الاتصال للتنسيق 📵' },
    { source_status: 'reporte', display_status: 'تم تأجيل موعد التسليم بناءً على طلبك 🗓️' },
    { source_status: 'livre', display_status: 'تم تسليم الشحنة واستلام المبلغ بنجاح ✅' },
  ];

  // 2. قوالب شبكة إيكوتراك (NOEST, DHD, Conexlog, World Express...)
  const ecotrackPresets = [
    { source_status: 'cree', display_status: 'تم تسجيل الشحنة وجاري تجهيزها للاستلام 📦' },
    { source_status: 'ramasse', display_status: 'تم استلام الشحنة من المتجر وبدأت عملية التوجيه 🚚' },
    { source_status: 'transit', display_status: 'الشحنة في طريقها بين الولايات والمراكز 🚛' },
    { source_status: 'stopdesk', display_status: 'طردك جاهز للاستلام الآن من مكتب التوصيل (Stopdesk) 🏢' },
    { source_status: 'centre', display_status: 'وصلت الشحنة إلى مركز التوزيع الإقليمي في ولايتك 📍' },
    { source_status: 'en_livraison', display_status: 'خرج للتوصيل مع المندوب اليوم، يرجى الانتباه لهاتفك 🛵' },
    { source_status: 'pas_de_reponse', display_status: 'تنبيه: حاول المندوب الاتصال بك ولم يتم الرد على الهاتف ⚠️' },
    { source_status: 'injoignable', display_status: 'تنبيه: رقم هاتفك غير متاح لشبكة الاتصال حالياً 📵' },
    { source_status: 'client_absent', display_status: 'تنبيه: المندوب وصل للعنوان والزبون غير متواجد ⚠️' },
    { source_status: 'reporte', display_status: 'تم تأجيل موعد تسليم الشحنة بناءً على رغبتك 🗓️' },
    { source_status: 'livre', display_status: 'تم تسليم الشحنة واستلام المبلغ بنجاح ✅' },
    { source_status: 'retour', display_status: 'تعذر تسليم الشحنة وجاري إرجاع الطرد إلى المتجر 🔄' },
  ];

  // 3. قوالب شوبيفاي
  const shopifyPresets = [
    { source_status: 'shopify_unfulfilled', display_status: 'تم استلام وتأكيد طلبك في المتجر 📝' },
    { source_status: 'shopify_fulfilled', display_status: 'تم تجهيز وتغليف طلبك وهو جاهز للشحن 📦' },
    { source_status: 'shopify_in_transit', display_status: 'الشحنة في طريقها إليك مع مندوب التوصيل 🚚' },
    { source_status: 'shopify_out_for_delivery', display_status: 'الشحنة مع المندوب للتسليم اليوم 🛵' },
    { source_status: 'shopify_delivered', display_status: 'تم تسليم طلبك بنجاح ✅' },
  ];

  let selected = yalidinePresets;
  if (presetType === 'shopify') selected = shopifyPresets;
  if (presetType === 'ecotrack') selected = ecotrackPresets;

  const rows = selected.map((item) => ({
    merchant_id: merchantId,
    source_status: item.source_status,
    display_status: item.display_status,
  }));

  await supabase.from('status_mappings').upsert(rows, { onConflict: 'merchant_id, source_status' });

  revalidatePath('/merchant');
  return { success: true };
}