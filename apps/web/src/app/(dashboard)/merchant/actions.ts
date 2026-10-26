'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSupabaseAdminClient } from '@saas/database';
import { BrandSettings, DEFAULT_BRAND_SETTINGS } from '@saas/ui';

type PersistedBrandSettings = BrandSettings & { showWhatsAppButton?: boolean; animateBackgroundBlobs?: boolean; backgroundBlur?: boolean; timelineLineStyle?: 'straight' | 'dashed' | 'dotted' | 'curved' | 'wave' | 'none' };
import { createClient } from '../../../lib/supabase-server';

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
    in_transit: 'في الطريق بين الولايات عبر خط النقل السريع 🚛',
    out_for_delivery: 'خرج للتوصيل مع المندوب اليوم، يرجى الانتباه لهاتفك 🛵',
    ready_for_pickup: 'طردك جاهز للاستلام الآن من مكتب شركة الشحن (Stopdesk) 🏢',
    attempt_failed_no_answer: 'تنبيه: حاول المندوب الاتصال بك ولم يتم الرد ⚠️',
    delivered: 'تم تسليم الشحنة واستلام المبلغ بنجاح ✅',
    returned: 'تعذر التسليم وجاري إرجاع الطرد إلى المتجر 🔄',
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

  // 4. قوالب شركة ZR Express ومحرك Procolis API
  const zrexpressPresets = [
    { source_status: 'pret_a_expedier', display_status: 'تم تسجيل الشحنة وجاري تجهيزها للاستلام من المتجر 📦' },
    { source_status: 'ramasse', display_status: 'استلم مندوب ZR Express الطرد وهو في طريقه للمركز اللوجستي 🚚' },
    { source_status: 'en_transit', display_status: 'الشحنة في طريقها بين الولايات عبر شبكة النقل السريع 🚛' },
    { source_status: 'en_bureau', display_status: 'طردك جاهز للاستلام الآن من مكتب ZR Express (Stopdesk) 🏢' },
    { source_status: 'en_livraison', display_status: 'خرج للتوصيل مع مندوب ZR Express اليوم، يرجى الانتباه لهاتفك 🛵' },
    { source_status: 'pas_de_reponse', display_status: 'تنبيه: حاول المندوب الاتصال بك لتسليم الشحنة ولم يتم الرد ⚠️' },
    { source_status: 'injoignable', display_status: 'تنبيه: رقم هاتفك غير متاح لشبكة الاتصال للتنسيق 📵' },
    { source_status: 'reporte', display_status: 'تم تأجيل موعد تسليم الشحنة بناءً على رغبتك 🗓️' },
    { source_status: 'livre', display_status: 'تم تسليم الشحنة واستلام المبلغ نقداً بنجاح ✅' },
    { source_status: 'retour', display_status: 'تعذر تسليم الشحنة وجاري إرجاع الطرد إلى المتجر 🔄' },
  ];

  // 5. قوالب شركة Maystro Delivery
  const maystroPresets = [
    { source_status: 'created', display_status: 'تم تسجيل الطلب في نظام Maystro وجاري تجهيزه للتسليم 📦' },
    { source_status: 'ramasse', display_status: 'استلم مندوب Maystro Delivery الطرد وهو في طريقه لمركز الفرز 🚚' },
    { source_status: 'in_transit', display_status: 'طردك في شاحنة النقل السريع متوجهاً نحو مركز ولايتك 🚛' },
    { source_status: 'point_de_retrait', display_status: 'طردك متوفر وجاهز للاستلام الآن من نقطة استلام Maystro 🏢' },
    { source_status: 'at_local_hub', display_status: 'وصل الطرد إلى مركز التوزيع المحلي لـ Maystro وجاري الفرز 🏢' },
    { source_status: 'out_for_delivery', display_status: 'المندوب في طريقه إليك لتسليم الطرد اليوم، يرجى إبقاء هاتفك مفتوحاً 🛵' },
    { source_status: 'delivered', display_status: 'تم تسليم الطرد بنجاح وتحصيل المبلغ، شكراً لثقتكم بنا! 🎉' },
    { source_status: 'attempt_failed_no_answer', display_status: 'تعذر التوصيل: الزبون لا يرد على الهاتف أو الرقم مغلق ⚠️' },
    { source_status: 'postponed', display_status: 'تم تأجيل موعد التسليم بطلب من الزبون إلى وقت لاحق ⏳' },
    { source_status: 'returned', display_status: 'تم إلغاء الطلب وهو في طريق الإرجاع إلى مستودع المتجر ↩️' },
  ];

  let selected = yalidinePresets;
  if (presetType === 'shopify') selected = shopifyPresets;
  if (presetType === 'ecotrack') selected = ecotrackPresets;
  if (presetType === 'zrexpress' || presetType === 'procolis') selected = zrexpressPresets;
  if (presetType === 'maystro') selected = maystroPresets;

  const rows = selected.map((item) => ({
    merchant_id: merchantId,
    source_status: item.source_status,
    display_status: item.display_status,
  }));

  await supabase.from('status_mappings').upsert(rows, { onConflict: 'merchant_id, source_status' });

  revalidatePath('/merchant');
  return { success: true };
}

// 3. حفظ وتحديث الهوية البصرية والعلامة التجارية (White-Label Branding)
export async function saveBrandSettings(formData: FormData) {
  const merchantId = formData.get('merchant_id') as string;
  if (!merchantId) return { error: 'معرّف المتجر غير موجود' };

  const rawJson = formData.get('brand_settings_json') as string;
  let settingsObj: PersistedBrandSettings;

  if (rawJson) {
    try {
      settingsObj = { ...DEFAULT_BRAND_SETTINGS, ...JSON.parse(rawJson) };
    } catch {
      settingsObj = { ...DEFAULT_BRAND_SETTINGS };
    }
  } else {
    settingsObj = {
      brandColor:          (formData.get('brand_color') as string)?.trim() || '#09090B',
      brandSubtitle:       (formData.get('brand_subtitle') as string)?.trim() || '',
      bgStyle:             (formData.get('bg_style') as any) || 'aurora',
      themeMode:           (formData.get('theme_mode') as any) || 'light',
      fontFamily:          (formData.get('font_family') as any) || 'readex',
      animationLevel:      (formData.get('animation_level') as any) || 'full',
      timelineDesign:      (formData.get('timeline_design') as any) || 'stepper',
      cardSurface:         (formData.get('card_surface') as any) || 'glass',
      cardRadius:          (formData.get('card_radius') as any) || 'modern',
      cardWidth:           (formData.get('card_width') as any) || 'standard',
      headerDensity:       (formData.get('header_density') as any) || 'comfortable',
      accentBarStyle:      (formData.get('accent_bar_style') as any) || 'solid',
      showCarrierBadge:        formData.get('show_carrier_badge') !== 'false',
      showProductSection:      formData.get('show_product_section') !== 'false',
      showLiveBadge:           formData.get('show_live_badge') !== 'false',
      showOrderNumberBadge:    formData.get('show_order_number_badge') !== 'false',
      showWhatsAppButton:      formData.get('show_whatsapp_button') !== 'false',
      supportPhone:        (formData.get('support_phone') as string)?.trim() || '',
      announcementText:    (formData.get('announcement_text') as string)?.trim() || '',
    };
  }

  const supabase = getSupabaseAdminClient();

  const settingsRows = [
    {
      merchant_id: merchantId,
      source_status: '__brand_settings_json__',
      display_status: JSON.stringify(settingsObj),
    },
    {
      merchant_id: merchantId,
      source_status: '__brand_primary_color__',
      display_status: settingsObj.brandColor,
    },
    {
      merchant_id: merchantId,
      source_status: '__brand_subtitle__',
      display_status: settingsObj.brandSubtitle,
    },
  ];

  const { error } = await supabase
    .from('status_mappings')
    .upsert(settingsRows, { onConflict: 'merchant_id, source_status' });

  if (error) {
    console.error('Error saving brand settings:', error);
    return { error: 'حدث خطأ أثناء حفظ إعدادات الهوية البصرية' };
  }

  revalidatePath('/merchant');
  revalidatePath('/t/[uuid]', 'page');
  return { success: true };
}

// 4. إرسال وصل تحويل BaridiMob لتجديد / ترقية الاشتراك
export async function submitPaymentProof(formData: FormData) {
  const merchantId = formData.get('merchant_id') as string;
  const planTier = (formData.get('plan_tier') as string) || 'basic';
  const amountDzd = parseInt((formData.get('amount_dzd') as string) || '1000', 10);
  const paymentMethod = (formData.get('payment_method') as string) || 'baridimob';
  const transactionRef = (formData.get('transaction_ref') as string)?.trim() || null;
  const paymentProofUrl = (formData.get('payment_proof_url') as string)?.trim() || null;

  if (!merchantId) return { error: 'معرّف المتجر غير موجود' };
  if (!transactionRef && !paymentProofUrl) {
    return { error: 'يرجى إدخال رقم العملية المرجعي أو رابط صورة الوصل' };
  }

  const supabase = getSupabaseAdminClient();

  const { error } = await supabase.from('subscription_payments').insert({
    merchant_id: merchantId,
    plan_tier: planTier,
    amount_dzd: amountDzd,
    payment_method: paymentMethod,
    transaction_ref: transactionRef,
    payment_proof_url: paymentProofUrl,
    status: 'pending',
  });

  if (error) {
    console.error('Error submitting payment proof:', error);
    return { error: 'حدث خطأ أثناء حفظ طلب الترقية، يرجى المحاولة لاحقاً' };
  }

  revalidatePath('/merchant');
  revalidatePath('/admin');
  return { success: true };
}

// 5. تسجيل الخروج من لوحة التاجر
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

