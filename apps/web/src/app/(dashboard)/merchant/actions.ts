'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSupabaseAdminClient } from '@saas/database';
import { TrackingOrchestrator } from '@saas/orchestrator';
import { enqueueOrderConfirmationForNewOrder } from '../../../lib/order-confirmation';
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

  // 1. جلب بيانات الطلب والمتجر
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('merchant_id, current_status')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    return { error: 'تعذر العثور على الطلب المطلوب' };
  }

  // إذا كانت الحالة متطابقة تماماً، ننهي العملية دون تسجيل أحداث مكررة
  if (order.current_status === newStatus) {
    return { success: true, noop: true };
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

  // 3. تحديث الحالة وإدراج السجل الزمني ذرّياً (Atomic Status Change RPC)
  const { data: rpcResult, error: rpcError } = await supabase.rpc('record_order_status_change', {
    p_order_id: orderId,
    p_status_raw: newStatus,
    p_status_title: statusTitle,
    p_description: description || null,
  });

  if (rpcError) {
    console.error('Error recording order status change via RPC:', rpcError);
    return { error: 'فشل تحديث حالة الطلب' };
  }

  revalidatePath('/merchant');
  return { success: true, changed: rpcResult?.[0]?.changed ?? true };
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

  // Also persist logo_url directly on the merchant row for fast lookups
  const logoUrl = settingsObj.logoUrl ?? null;
  await supabase
    .from('merchants')
    .update({ logo_url: logoUrl })
    .eq('id', merchantId);

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

// 5. تفعيل أو تعطيل إرسال رابط التتبع تلقائياً عبر تيليجرام
export async function toggleTelegramTracking(merchantId: string, enabled: boolean) {
  if (!merchantId) return { error: 'معرّف المتجر غير موجود' };

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('merchants')
    .update({ telegram_tracking_link_enabled: enabled })
    .eq('id', merchantId);

  if (error) {
    console.error('Error toggling telegram tracking:', error);
    return { error: 'حدث خطأ أثناء تحديث إعدادات تيليجرام' };
  }

  revalidatePath('/merchant');
  return { success: true };
}

// 6. تسجيل الخروج من لوحة التاجر
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

// 7. إنشاء طلب يدوي من لوحة تحكم التاجر (للاختبار والطلبات اليدوية)
export async function createManualOrder(formData: FormData) {
  const merchantId = formData.get('merchant_id') as string;
  const externalOrderId = (formData.get('external_order_id') as string)?.trim() || `ORD-${Date.now().toString().slice(-6)}`;
  const customerName = (formData.get('customer_name') as string)?.trim() || '';
  const customerPhone = (formData.get('customer_phone') as string)?.trim() || '';
  const productName = (formData.get('product_name') as string)?.trim() || '';
  const carrierName = (formData.get('carrier_name') as string)?.trim() || 'Yalidine Express';
  const carrierTrackingNumber = (formData.get('carrier_tracking_number') as string)?.trim() || '';
  const statusRaw = (formData.get('status_raw') as string)?.trim() || 'order_placed';
  const telegramConsent = formData.get('telegram_consent') === 'true' || formData.get('telegram_consent') === 'on';
  const autoEnableTelegram = formData.get('auto_enable_telegram') === 'true' || formData.get('auto_enable_telegram') === 'on';

  if (!merchantId) {
    return { error: 'معرّف المتجر غير موجود' };
  }
  if (!customerPhone) {
    return { error: 'يرجى إدخال رقم هاتف العميل' };
  }

  const supabase = getSupabaseAdminClient();

  // إذا تم اختيار تيليجرام وكان خيار المتجر معطلاً، نقوم بتفعيله لضمان إدراج مهمة الإرسال في الـ Outbox
  if (telegramConsent || autoEnableTelegram) {
    await supabase
      .from('merchants')
      .update({ telegram_tracking_link_enabled: true })
      .eq('id', merchantId);
  }

  const orchestrator = new TrackingOrchestrator();
  const result = await orchestrator.processEvent({
    merchantId,
    externalOrderId,
    customerName: customerName || undefined,
    customerPhone: customerPhone || undefined,
    productName: productName || undefined,
    carrierName: carrierName || undefined,
    carrierTrackingNumber: carrierTrackingNumber || undefined,
    statusRaw,
    description: 'تم تسجيل الطلب يدوياً من لوحة التاجر',
    customerTelegramConsent: telegramConsent,
    telegramConsentSource: 'merchant_manual_test',
    telegramConsentVersion: 'v1',
  });

  if (!result.success) {
  return { error: result.message || 'حدث خطأ أثناء إضافة الطلب' };
}

  if (!result.isNewOrder || !result.orderId) {
    return {
      error: 'هذا الطلب موجود بالفعل ولم يتم إنشاء طلب جديد.',
    };
  }

  // Queue confirmation and mark the customer-confirmation stage without changing carrier status.
  let confirmationQueued = false;
  let confirmationQueueError = false;

  try {
    const confirmationResult = await enqueueOrderConfirmationForNewOrder({
      merchantId,
      orderId: result.orderId,
      customerPhone,
    });
    confirmationQueued = confirmationResult.queued;
  } catch (confirmErr: any) {
    // The order was already created; do not report creation failure or encourage duplicate retries.
    confirmationQueueError = true;
    console.error(
      '[ManualOrderConfirmEnqueue]: Failed to enqueue confirmation job:',
      confirmErr?.message || confirmErr
    );
  }

  revalidatePath('/merchant');
  return {
    success: true,
    trackingUuid: result.trackingUuid,
    externalOrderId,
    confirmationQueued,
    confirmationQueueError,
  };
}


// ============================================================================
// Upsell / "You May Also Like" Feature Server Actions
// ============================================================================

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

export async function fetchProductUrlMetadata(url: string) {
  if (!url || typeof url !== 'string') {
    return { error: 'يرجى إدخال رابط المنتج' };
  }

  let validUrl: URL;
  try {
    validUrl = new URL(url.trim());
    if (!['http:', 'https:'].includes(validUrl.protocol)) {
      return { error: 'يجب أن يبدأ الرابط بـ http:// أو https://' };
    }
  } catch {
    return { error: 'الرابط غير صالح، يرجى التأكد منه' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

    // 1. Shopify Native JSON Shortcut:
    // If URL contains /products/, Shopify natively provides a public JSON endpoint: /products/[handle].json
    // This avoids HTML Cloudflare challenges and 429 scraping blocks completely!
    if (validUrl.pathname.includes('/products/')) {
      try {
        const cleanPath = validUrl.pathname.replace(/\/+$/, '');
        const jsonUrl = `${validUrl.origin}${cleanPath}.json`;
        const jsonRes = await fetch(jsonUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Accept: 'application/json',
          },
        });

        if (jsonRes.ok) {
          const contentType = jsonRes.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const data = await jsonRes.json();
            if (data && data.product) {
              clearTimeout(timeoutId);
              const p = data.product;
              const title = p.title || '';
              const imageUrl = p.image?.src || p.images?.[0]?.src || '';
              const rawPrice = p.variants?.[0]?.price;
              const price = rawPrice ? `${rawPrice} د.ج` : '';

              return {
                success: true,
                title: title || 'منتج جديد',
                image_url: imageUrl,
                price: price || null,
                product_url: validUrl.href,
              };
            }
          }
        }
      } catch (jsonErr) {
        // If JSON endpoint fails or isn't Shopify, seamlessly fall back to HTML scraping below
      }
    }

    // 2. Standard HTML OpenGraph Scraper with realistic browser headers
    const response = await fetch(validUrl.href, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ar,en-US,en;q=0.9,fr;q=0.8',
        'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
    });

    clearTimeout(timeoutId);

    if (response.status === 429) {
      return {
        error:
          'الموقع يطبق جدار حماية ضد الروبوتات والطلبات المتكررة (Rate Limit 429). يمكنك كتابة اسم وصورة المنتج يدوياً وسيعمل مباشرة.',
      };
    }

    if (response.status === 403) {
      return {
        error:
          'الموقع محمي بجدار حماية ضد الكشط (403 Forbidden). يمكنك إدخال بيانات المنتج يدوياً.',
      };
    }

    if (!response.ok) {
      return { error: `تعذر الاتصال بصفحة المنتج (رمز الحالة: ${response.status})` };
    }

    const html = await response.text();

    // 1. Extract Title
    let title =
      html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<meta\s+name=["']twitter:title["']\s+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ||
      '';

    title = decodeHtmlEntities(title).trim();

    // 2. Extract Image
    let imageUrl =
      html.match(/<meta\s+property=["']og:image:secure_url["']\s+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<link\s+rel=["']image_src["']\s+href=["']([^"']+)["']/i)?.[1] ||
      '';

    imageUrl = decodeHtmlEntities(imageUrl).trim();
    if (imageUrl && !imageUrl.startsWith('http')) {
      try {
        imageUrl = new URL(imageUrl, validUrl.origin).href;
      } catch {
        // keep as is
      }
    }

    // 3. Extract Price (Optional)
    let price =
      html.match(/<meta\s+property=["']product:price:amount["']\s+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<meta\s+property=["']og:price:amount["']\s+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/"price":\s*"?([0-9.,]+)"?/i)?.[1] ||
      '';

    price = price.trim();

    return {
      success: true,
      title: title || 'منتج جديد',
      image_url: imageUrl || '',
      price: price || null,
      product_url: validUrl.href,
    };
  } catch (err: any) {
    console.warn('[MetadataScraper]: Error fetching URL:', err?.message || err);
    return {
      error: 'تعذر جلب البيانات تلقائياً، يمكنك إدخال اسم وصورة المنتج يدوياً',
    };
  }
}

export async function getMerchantUpsells() {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return { error: 'غير مصرح' };

  const supabaseAdmin = getSupabaseAdminClient();
  const { data: merchant } = await supabaseAdmin
    .from('merchants')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!merchant) return { error: 'ملف التاجر غير موجود' };

  const { data: upsells, error } = await supabaseAdmin
    .from('merchant_upsells')
    .select('*')
    .eq('merchant_id', merchant.id)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching upsells:', error);
    return { error: 'فشل جلب المنتجات' };
  }

  return { success: true, upsells: upsells || [] };
}

export async function saveMerchantUpsell(formData: FormData) {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return { error: 'غير مصرح' };

  const supabaseAdmin = getSupabaseAdminClient();
  const { data: merchant } = await supabaseAdmin
    .from('merchants')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!merchant) return { error: 'ملف التاجر غير موجود' };

  const id = (formData.get('id') as string)?.trim() || undefined;
  const title = (formData.get('title') as string)?.trim();
  const imageUrl = (formData.get('image_url') as string)?.trim();
  const productUrl = (formData.get('product_url') as string)?.trim();
  const price = (formData.get('price') as string)?.trim() || null;
  const isActive = formData.get('is_active') === 'true' || formData.get('is_active') === 'on';

  if (!title || !imageUrl || !productUrl) {
    return { error: 'يرجى ملء الحقول الأساسية: العنوان، الصورة، ورابط المنتج' };
  }

  const payload: any = {
    merchant_id: merchant.id,
    title,
    image_url: imageUrl,
    product_url: productUrl,
    price: price || null,
    is_active: isActive !== false,
    updated_at: new Date().toISOString(),
  };

  if (id) {
    const { error } = await supabaseAdmin
      .from('merchant_upsells')
      .update(payload)
      .eq('id', id)
      .eq('merchant_id', merchant.id);

    if (error) {
      console.error('Error updating upsell:', error);
      return { error: 'فشل تعديل المنتج' };
    }
  } else {
    // Determine the next display order for the merchant
    const { data: lastItem } = await supabaseAdmin
      .from('merchant_upsells')
      .select('display_order')
      .eq('merchant_id', merchant.id)
      .order('display_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    payload.display_order = (lastItem?.display_order !== undefined && lastItem?.display_order !== null)
      ? lastItem.display_order + 1
      : 0;

    const { error } = await supabaseAdmin
      .from('merchant_upsells')
      .insert(payload);

    if (error) {
      console.error('Error inserting upsell:', error);
      return { error: 'فشل إضافة المنتج' };
    }
  }

  revalidatePath('/merchant');
  return { success: true };
}

export async function reorderMerchantUpsell(id: string, direction: 'up' | 'down') {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return { error: 'غير مصرح' };

  const supabaseAdmin = getSupabaseAdminClient();
  const { data: merchant } = await supabaseAdmin
    .from('merchants')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!merchant) return { error: 'ملف التاجر غير موجود' };

  const { data: upsells, error } = await supabaseAdmin
    .from('merchant_upsells')
    .select('id, display_order, created_at')
    .eq('merchant_id', merchant.id)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error || !upsells || upsells.length <= 1) {
    return { success: true };
  }

  const currentIndex = upsells.findIndex((u) => u.id === id);
  if (currentIndex === -1) return { error: 'المنتج غير موجود' };

  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= upsells.length) {
    return { success: true };
  }

  // Swap items in memory
  const reordered = [...upsells];
  const [targetItem] = reordered.splice(currentIndex, 1);
  reordered.splice(targetIndex, 0, targetItem);

  // Update display_order sequentially
  for (let i = 0; i < reordered.length; i++) {
    const item = reordered[i];
    if (item.display_order !== i) {
      await supabaseAdmin
        .from('merchant_upsells')
        .update({ display_order: i, updated_at: new Date().toISOString() })
        .eq('id', item.id)
        .eq('merchant_id', merchant.id);
    }
  }

  revalidatePath('/merchant');
  return { success: true };
}

export async function deleteMerchantUpsell(id: string) {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return { error: 'غير مصرح' };

  const supabaseAdmin = getSupabaseAdminClient();
  const { data: merchant } = await supabaseAdmin
    .from('merchants')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!merchant) return { error: 'ملف التاجر غير موجود' };

  const { error } = await supabaseAdmin
    .from('merchant_upsells')
    .delete()
    .eq('id', id)
    .eq('merchant_id', merchant.id);

  if (error) {
    console.error('Error deleting upsell:', error);
    return { error: 'فشل حذف المنتج' };
  }

  revalidatePath('/merchant');
  return { success: true };
}

export async function toggleMerchantUpsell(id: string, isActive: boolean) {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return { error: 'غير مصرح' };

  const supabaseAdmin = getSupabaseAdminClient();
  const { data: merchant } = await supabaseAdmin

    .from('merchants')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!merchant) return { error: 'ملف التاجر غير موجود' };

  const { error } = await supabaseAdmin
    .from('merchant_upsells')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('merchant_id', merchant.id);

  if (error) {
    console.error('Error toggling upsell:', error);
    return { error: 'فشل تحديث حالة المنتج' };
  }

  revalidatePath('/merchant');
  return { success: true };
}

export async function toggleConfirmationTelegram(enabled: boolean) {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return { error: 'غير مصرح' };

  const supabaseAdmin = getSupabaseAdminClient();
  const { data: merchant } = await supabaseAdmin
    .from('merchants')
    .select('id, subscription_tier, subscription_status')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!merchant) return { error: 'ملف التاجر غير موجود' };

  const tier = merchant.subscription_tier || 'starter';
  if (tier === 'starter') {
    return { error: 'هذه الميزة متاحة فقط للباقات المدفوعة' };
  }

  const { error } = await supabaseAdmin
    .from('merchants')
    .update({ confirmation_telegram_enabled: enabled } as any)
    .eq('id', merchant.id);

  if (error) {
    console.error('Error toggling confirmation telegram:', error);
    return { error: 'فشل تحديث الإعداد' };
  }

  revalidatePath('/merchant');
  return { success: true };
}
