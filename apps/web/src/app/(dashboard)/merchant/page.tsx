import React from 'react';
import { createClient } from '../../../lib/supabase-server';
import { getSupabaseAdminClient } from '@saas/database';
import { MerchantDashboardView } from './MerchantDashboardView';
import styles from './merchant.module.css';

export default async function MerchantDashboardPage() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  if (!user) {
    return <div className={styles.container}>غير مصرح لك بالدخول. يرجى تسجيل الدخول.</div>;
  }

  const supabaseAdmin = getSupabaseAdminClient();

  // جلب ملف التاجر الحالي
  const { data: merchant } = await supabaseAdmin
    .from('merchants')
    .select('id, store_name, api_key')
    .eq('auth_user_id', user.id)
    .single();

  if (!merchant) {
    return (
      <div className={styles.container}>
        <h2>عذراً، لم يتم العثور على ملف تاجر مرتبط بحسابك.</h2>
      </div>
    );
  }

  // جلب جميع الطلبات
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('id, external_order_id, customer_name, customer_phone, current_status, carrier_name, carrier_tracking_number, tracking_uuid, created_at')
    .eq('merchant_id', merchant.id)
    .order('created_at', { ascending: false });

  // جلب مطابقات الحالات
  const { data: mappings } = await supabaseAdmin
    .from('status_mappings')
    .select('id, source_status, display_status')
    .eq('merchant_id', merchant.id);

  // استخراج رابط الموقع الأساسي
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://dz-tracker-three.vercel.app';

  return (
    <MerchantDashboardView
      storeName={merchant.store_name}
      apiKey={merchant.api_key}
      merchantId={merchant.id}
      orders={orders || []}
      mappings={mappings || []}
      siteUrl={siteUrl}
    />
  );
}