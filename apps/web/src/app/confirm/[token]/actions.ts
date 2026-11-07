'use server';

import { getSupabaseAdminClient } from '@saas/database';

export async function respondToConfirmation(
  token: string,
  action: 'confirm' | 'cancel'
): Promise<{ success: boolean; error?: string }> {
  if (!token || !action) return { success: false, error: 'بيانات غير مكتملة' };

  const supabase = getSupabaseAdminClient();

  // Fetch order by token
  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select('id, confirmation_status, confirmation_expires_at')
    .eq('confirmation_token', token)
    .maybeSingle();

  if (fetchErr || !order) {
    return { success: false, error: 'رابط غير صالح' };
  }

  // Guard: already responded
  if (order.confirmation_status === 'confirmed' || order.confirmation_status === 'cancelled') {
    return { success: true }; // idempotent — treat as OK
  }

  // Guard: expired
  if (
    order.confirmation_expires_at &&
    new Date(order.confirmation_expires_at).getTime() < Date.now()
  ) {
    return { success: false, error: 'انتهت صلاحية الرابط' };
  }

  const newStatus = action === 'confirm' ? 'confirmed' : 'cancelled';

  const { error: updateErr } = await supabase
    .from('orders')
    .update({
      confirmation_status: newStatus,
      confirmation_responded_at: new Date().toISOString(),
    } as any)
    .eq('id', order.id);

  if (updateErr) {
    console.error('[ConfirmAction]: Failed to update confirmation status:', updateErr.message);
    return { success: false, error: 'حدث خطأ، يرجى المحاولة مجدداً' };
  }

  return { success: true };
}

