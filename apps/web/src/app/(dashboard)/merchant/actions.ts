'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSupabaseAdminClient } from '@saas/database';
import { TrackingOrchestrator } from '@saas/orchestrator';
import { BrandSettings, DEFAULT_BRAND_SETTINGS } from '@saas/ui';

type PersistedBrandSettings = BrandSettings & { showWhatsAppButton?: boolean; animateBackgroundBlobs?: boolean; backgroundBlur?: boolean; timelineLineStyle?: 'straight' | 'dashed' | 'dotted' | 'curved' | 'wave' | 'none' };
import { createClient } from '../../../lib/supabase-server';

export async function saveStatusMapping(formData: FormData) {
  const merchantId = formData.get('merchant_id') as string;
  const sourceStatus = (formData.get('source_status') as string)?.trim().toLowerCase();
  const displayStatus = (formData.get('display_status') as string)?.trim();

  if (!merchantId || !sourceStatus || !displayStatus) {
    return { error: 'ÙŠØ±Ø¬Ù‰ Ù…Ù„Ø¡ Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø­Ù‚ÙˆÙ„ Ø§Ù„Ù…Ø·Ù„ÙˆØ¨Ø©' };
  }

  const supabase = getSupabaseAdminClient();

  // Ø¥Ø¯Ø®Ø§Ù„ Ø£Ùˆ ØªØ­Ø¯ÙŠØ« Ø§Ù„Ù…Ø·Ø§Ø¨Ù‚Ø© Ø¨Ù†Ø§Ø¡Ù‹ Ø¹Ù„Ù‰ (merchant_id + source_status)
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
    return { error: 'Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø­ÙØ¸ Ø§Ù„Ù…Ø·Ø§Ø¨Ù‚Ø©' };
  }

  // ØªØ­Ø¯ÙŠØ« ÙƒØ§Ø´ Ø§Ù„ØµÙØ­Ø© ÙÙˆØ±Ø§Ù‹ ÙÙŠ Next.js
  revalidatePath('/merchant');
  return { success: true };
}

export async function updateOrderStatus(formData: FormData) {
  const orderId = formData.get('order_id') as string;
  const newStatus = formData.get('status') as string;
  const description = formData.get('description') as string || '';

  if (!orderId || !newStatus) return { error: 'Ø¨ÙŠØ§Ù†Ø§Øª ØºÙŠØ± Ù…ÙƒØªÙ…Ù„Ø©' };

  const supabase = getSupabaseAdminClient();

  // 1. Ø¬Ù„Ø¨ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø·Ù„Ø¨ ÙˆØ§Ù„Ù…ØªØ¬Ø±
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('merchant_id, current_status')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    return { error: 'ØªØ¹Ø°Ø± Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ Ø§Ù„Ø·Ù„Ø¨ Ø§Ù„Ù…Ø·Ù„ÙˆØ¨' };
  }

  // Ø¥Ø°Ø§ ÙƒØ§Ù†Øª Ø§Ù„Ø­Ø§Ù„Ø© Ù…ØªØ·Ø§Ø¨Ù‚Ø© ØªÙ…Ø§Ù…Ø§Ù‹ØŒ Ù†Ù†Ù‡ÙŠ Ø§Ù„Ø¹Ù…Ù„ÙŠØ© Ø¯ÙˆÙ† ØªØ³Ø¬ÙŠÙ„ Ø£Ø­Ø¯Ø§Ø« Ù…ÙƒØ±Ø±Ø©
  if (order.current_status === newStatus) {
    return { success: true, noop: true };
  }

  // 2. Ø§Ù„Ø¨Ø­Ø« Ø¹Ù† Ø§Ù„Ù…Ø³Ù…Ù‰ Ø§Ù„Ù…Ø¹Ø±ÙˆØ¶ Ø¨Ù†Ø§Ø¡Ù‹ Ø¹Ù„Ù‰ Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„ØªØ§Ø¬Ø±
  const { data: mapping } = await supabase
    .from('status_mappings')
    .select('display_status')
    .eq('merchant_id', order.merchant_id)
    .eq('source_status', newStatus)
    .maybeSingle();

  const titleMap: Record<string, string> = {
    order_placed: 'ØªÙ… Ø§Ø³ØªÙ„Ø§Ù… Ø§Ù„Ø·Ù„Ø¨ ðŸ“',
    processing: 'Ù‚ÙŠØ¯ Ø§Ù„ØªØ¬Ù‡ÙŠØ² ÙÙŠ Ø§Ù„Ù…Ø³ØªÙˆØ¯Ø¹ ðŸ“¦',
    shipped: 'Ø®Ø±Ø¬ Ù„Ù„ØªÙˆØµÙŠÙ„ Ù…Ø¹ Ø§Ù„Ù…Ù†Ø¯ÙˆØ¨ ðŸšš',
    in_transit: 'ÙÙŠ Ø§Ù„Ø·Ø±ÙŠÙ‚ Ø¨ÙŠÙ† Ø§Ù„ÙˆÙ„Ø§ÙŠØ§Øª Ø¹Ø¨Ø± Ø®Ø· Ø§Ù„Ù†Ù‚Ù„ Ø§Ù„Ø³Ø±ÙŠØ¹ ðŸš›',
    out_for_delivery: 'Ø®Ø±Ø¬ Ù„Ù„ØªÙˆØµÙŠÙ„ Ù…Ø¹ Ø§Ù„Ù…Ù†Ø¯ÙˆØ¨ Ø§Ù„ÙŠÙˆÙ…ØŒ ÙŠØ±Ø¬Ù‰ Ø§Ù„Ø§Ù†ØªØ¨Ø§Ù‡ Ù„Ù‡Ø§ØªÙÙƒ ðŸ›µ',
    ready_for_pickup: 'Ø·Ø±Ø¯Ùƒ Ø¬Ø§Ù‡Ø² Ù„Ù„Ø§Ø³ØªÙ„Ø§Ù… Ø§Ù„Ø¢Ù† Ù…Ù† Ù…ÙƒØªØ¨ Ø´Ø±ÙƒØ© Ø§Ù„Ø´Ø­Ù† (Stopdesk) ðŸ¢',
    attempt_failed_no_answer: 'ØªÙ†Ø¨ÙŠÙ‡: Ø­Ø§ÙˆÙ„ Ø§Ù„Ù…Ù†Ø¯ÙˆØ¨ Ø§Ù„Ø§ØªØµØ§Ù„ Ø¨Ùƒ ÙˆÙ„Ù… ÙŠØªÙ… Ø§Ù„Ø±Ø¯ âš ï¸',
    delivered: 'ØªÙ… ØªØ³Ù„ÙŠÙ… Ø§Ù„Ø´Ø­Ù†Ø© ÙˆØ§Ø³ØªÙ„Ø§Ù… Ø§Ù„Ù…Ø¨Ù„Øº Ø¨Ù†Ø¬Ø§Ø­ âœ…',
    returned: 'ØªØ¹Ø°Ø± Ø§Ù„ØªØ³Ù„ÙŠÙ… ÙˆØ¬Ø§Ø±ÙŠ Ø¥Ø±Ø¬Ø§Ø¹ Ø§Ù„Ø·Ø±Ø¯ Ø¥Ù„Ù‰ Ø§Ù„Ù…ØªØ¬Ø± ðŸ”„',
    cancelled: 'ØªÙ… Ø¥Ù„ØºØ§Ø¡ Ø§Ù„Ø·Ù„Ø¨ âŒ',
  };

  const statusTitle = mapping?.display_status || titleMap[newStatus] || newStatus;

  // 3. ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø­Ø§Ù„Ø© ÙˆØ¥Ø¯Ø±Ø§Ø¬ Ø§Ù„Ø³Ø¬Ù„ Ø§Ù„Ø²Ù…Ù†ÙŠ Ø°Ø±Ù‘ÙŠØ§Ù‹ (Atomic Status Change RPC)
  const { data: rpcResult, error: rpcError } = await supabase.rpc('record_order_status_change', {
    p_order_id: orderId,
    p_status_raw: newStatus,
    p_status_title: statusTitle,
    p_description: description || null,
  });

  if (rpcError) {
    console.error('Error recording order status change via RPC:', rpcError);
    return { error: 'ÙØ´Ù„ ØªØ­Ø¯ÙŠØ« Ø­Ø§Ù„Ø© Ø§Ù„Ø·Ù„Ø¨' };
  }

  revalidatePath('/merchant');
  return { success: true, changed: rpcResult?.[0]?.changed ?? true };
}

// 1. Ø­Ø°Ù Ù…Ø·Ø§Ø¨Ù‚Ø© Ø­Ø§Ù„Ø©
export async function deleteStatusMapping(formData: FormData) {
  const id = formData.get('id') as string;
  if (!id) return { error: 'Missing mapping ID' };

  const supabase = getSupabaseAdminClient();
  await supabase.from('status_mappings').delete().eq('id', id);

  revalidatePath('/merchant');
  return { success: true };
}

// 2. ØªØ·Ø¨ÙŠÙ‚ Ø­Ø²Ù… Ø§Ù„Ù‚ÙˆØ§Ù„Ø¨ Ø§Ù„Ø¬Ø§Ù‡Ø²Ø© Ø¨Ù†Ù‚Ø±Ø© ÙˆØ§Ø­Ø¯Ø© (Ø´ÙˆØ¨ÙŠÙØ§ÙŠ Ø£Ùˆ ÙŠØ§Ù„ÙŠØ¯ÙŠÙ†)
export async function applyPresetMappings(formData: FormData) {
  const merchantId = formData.get('merchant_id') as string;
  const presetType = formData.get('preset_type') as string;

  if (!merchantId || !presetType) return { error: 'Ø¨ÙŠØ§Ù†Ø§Øª ØºÙŠØ± Ù…ÙƒØªÙ…Ù„Ø©' };

  const supabase = getSupabaseAdminClient();

  // 1. Ù‚ÙˆØ§Ù„Ø¨ ÙŠØ§Ù„ÙŠØ¯ÙŠÙ† Ø§Ù„Ù…ÙŠØ¯Ø§Ù†ÙŠØ©
  const yalidinePresets = [
    { source_status: 'en_preparation', display_status: 'ØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø´Ø­Ù†Ø© ÙˆØ¬Ø§Ø±ÙŠ ØªØ¬Ù‡ÙŠØ²Ù‡Ø§ ðŸ“¦' },
    { source_status: 'vers_wilaya', display_status: 'Ø§Ù„Ø´Ø­Ù†Ø© ÙÙŠ Ø§Ù„Ø·Ø±ÙŠÙ‚ Ø¥Ù„Ù‰ ÙˆÙ„Ø§ÙŠØªÙƒ Ø¹Ø¨Ø± Ø®Ø· Ø§Ù„Ù†Ù‚Ù„ Ø§Ù„Ø³Ø±ÙŠØ¹ ðŸš›' },
    { source_status: 'centre', display_status: 'ÙˆØµÙ„Øª Ø¥Ù„Ù‰ Ù…Ø±ÙƒØ² Ø§Ù„ØªÙˆØ²ÙŠØ¹ Ø§Ù„Ù…Ø­Ù„ÙŠ ÙÙŠ ÙˆÙ„Ø§ÙŠØªÙƒ ðŸ“' },
    { source_status: 'stopdesk', display_status: 'Ø¬Ø§Ù‡Ø² Ù„Ù„Ø§Ø³ØªÙ„Ø§Ù… Ù…Ù† Ù…ÙƒØªØ¨ ÙŠØ§Ù„ÙŠØ¯ÙŠÙ† ÙÙŠ ÙˆÙ„Ø§ÙŠØªÙƒ ðŸ¢' },
    { source_status: 'sorti_en_livraison', display_status: 'Ø®Ø±Ø¬ Ù„Ù„ØªÙˆØµÙŠÙ„ Ù…Ø¹ Ø§Ù„Ù…Ù†Ø¯ÙˆØ¨ Ø§Ù„ÙŠÙˆÙ…ØŒ ÙŠØ±Ø¬Ù‰ Ø§Ù„Ø§Ù†ØªØ¨Ø§Ù‡ Ù„Ù‡Ø§ØªÙÙƒ ðŸ›µ' },
    { source_status: 'tentative_echouee', display_status: 'ØªÙ†Ø¨ÙŠÙ‡: Ø­Ø§ÙˆÙ„ Ø§Ù„Ù…Ù†Ø¯ÙˆØ¨ Ø§Ù„Ø§ØªØµØ§Ù„ Ø¨Ùƒ ÙˆÙ„Ù… ÙŠØªÙ… Ø§Ù„Ø±Ø¯ âš ï¸' },
    { source_status: 'injoignable', display_status: 'ØªÙ†Ø¨ÙŠÙ‡: Ù‡Ø§ØªÙÙƒ ØºÙŠØ± Ù…ØªØ§Ø­ Ù„Ø´Ø¨ÙƒØ© Ø§Ù„Ø§ØªØµØ§Ù„ Ù„Ù„ØªÙ†Ø³ÙŠÙ‚ ðŸ“µ' },
    { source_status: 'reporte', display_status: 'ØªÙ… ØªØ£Ø¬ÙŠÙ„ Ù…ÙˆØ¹Ø¯ Ø§Ù„ØªØ³Ù„ÙŠÙ… Ø¨Ù†Ø§Ø¡Ù‹ Ø¹Ù„Ù‰ Ø·Ù„Ø¨Ùƒ ðŸ—“ï¸' },
    { source_status: 'livre', display_status: 'ØªÙ… ØªØ³Ù„ÙŠÙ… Ø§Ù„Ø´Ø­Ù†Ø© ÙˆØ§Ø³ØªÙ„Ø§Ù… Ø§Ù„Ù…Ø¨Ù„Øº Ø¨Ù†Ø¬Ø§Ø­ âœ…' },
  ];

  // 2. Ù‚ÙˆØ§Ù„Ø¨ Ø´Ø¨ÙƒØ© Ø¥ÙŠÙƒÙˆØªØ±Ø§Ùƒ (NOEST, DHD, Conexlog, World Express...)
  const ecotrackPresets = [
    { source_status: 'cree', display_status: 'ØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø´Ø­Ù†Ø© ÙˆØ¬Ø§Ø±ÙŠ ØªØ¬Ù‡ÙŠØ²Ù‡Ø§ Ù„Ù„Ø§Ø³ØªÙ„Ø§Ù… ðŸ“¦' },
    { source_status: 'ramasse', display_status: 'ØªÙ… Ø§Ø³ØªÙ„Ø§Ù… Ø§Ù„Ø´Ø­Ù†Ø© Ù…Ù† Ø§Ù„Ù…ØªØ¬Ø± ÙˆØ¨Ø¯Ø£Øª Ø¹Ù…Ù„ÙŠØ© Ø§Ù„ØªÙˆØ¬ÙŠÙ‡ ðŸšš' },
    { source_status: 'transit', display_status: 'Ø§Ù„Ø´Ø­Ù†Ø© ÙÙŠ Ø·Ø±ÙŠÙ‚Ù‡Ø§ Ø¨ÙŠÙ† Ø§Ù„ÙˆÙ„Ø§ÙŠØ§Øª ÙˆØ§Ù„Ù…Ø±Ø§ÙƒØ² ðŸš›' },
    { source_status: 'stopdesk', display_status: 'Ø·Ø±Ø¯Ùƒ Ø¬Ø§Ù‡Ø² Ù„Ù„Ø§Ø³ØªÙ„Ø§Ù… Ø§Ù„Ø¢Ù† Ù…Ù† Ù…ÙƒØªØ¨ Ø§Ù„ØªÙˆØµÙŠÙ„ (Stopdesk) ðŸ¢' },
    { source_status: 'centre', display_status: 'ÙˆØµÙ„Øª Ø§Ù„Ø´Ø­Ù†Ø© Ø¥Ù„Ù‰ Ù…Ø±ÙƒØ² Ø§Ù„ØªÙˆØ²ÙŠØ¹ Ø§Ù„Ø¥Ù‚Ù„ÙŠÙ…ÙŠ ÙÙŠ ÙˆÙ„Ø§ÙŠØªÙƒ ðŸ“' },
    { source_status: 'en_livraison', display_status: 'Ø®Ø±Ø¬ Ù„Ù„ØªÙˆØµÙŠÙ„ Ù…Ø¹ Ø§Ù„Ù…Ù†Ø¯ÙˆØ¨ Ø§Ù„ÙŠÙˆÙ…ØŒ ÙŠØ±Ø¬Ù‰ Ø§Ù„Ø§Ù†ØªØ¨Ø§Ù‡ Ù„Ù‡Ø§ØªÙÙƒ ðŸ›µ' },
    { source_status: 'pas_de_reponse', display_status: 'ØªÙ†Ø¨ÙŠÙ‡: Ø­Ø§ÙˆÙ„ Ø§Ù„Ù…Ù†Ø¯ÙˆØ¨ Ø§Ù„Ø§ØªØµØ§Ù„ Ø¨Ùƒ ÙˆÙ„Ù… ÙŠØªÙ… Ø§Ù„Ø±Ø¯ Ø¹Ù„Ù‰ Ø§Ù„Ù‡Ø§ØªÙ âš ï¸' },
    { source_status: 'injoignable', display_status: 'ØªÙ†Ø¨ÙŠÙ‡: Ø±Ù‚Ù… Ù‡Ø§ØªÙÙƒ ØºÙŠØ± Ù…ØªØ§Ø­ Ù„Ø´Ø¨ÙƒØ© Ø§Ù„Ø§ØªØµØ§Ù„ Ø­Ø§Ù„ÙŠØ§Ù‹ ðŸ“µ' },
    { source_status: 'client_absent', display_status: 'ØªÙ†Ø¨ÙŠÙ‡: Ø§Ù„Ù…Ù†Ø¯ÙˆØ¨ ÙˆØµÙ„ Ù„Ù„Ø¹Ù†ÙˆØ§Ù† ÙˆØ§Ù„Ø²Ø¨ÙˆÙ† ØºÙŠØ± Ù…ØªÙˆØ§Ø¬Ø¯ âš ï¸' },
    { source_status: 'reporte', display_status: 'ØªÙ… ØªØ£Ø¬ÙŠÙ„ Ù…ÙˆØ¹Ø¯ ØªØ³Ù„ÙŠÙ… Ø§Ù„Ø´Ø­Ù†Ø© Ø¨Ù†Ø§Ø¡Ù‹ Ø¹Ù„Ù‰ Ø±ØºØ¨ØªÙƒ ðŸ—“ï¸' },
    { source_status: 'livre', display_status: 'ØªÙ… ØªØ³Ù„ÙŠÙ… Ø§Ù„Ø´Ø­Ù†Ø© ÙˆØ§Ø³ØªÙ„Ø§Ù… Ø§Ù„Ù…Ø¨Ù„Øº Ø¨Ù†Ø¬Ø§Ø­ âœ…' },
    { source_status: 'retour', display_status: 'ØªØ¹Ø°Ø± ØªØ³Ù„ÙŠÙ… Ø§Ù„Ø´Ø­Ù†Ø© ÙˆØ¬Ø§Ø±ÙŠ Ø¥Ø±Ø¬Ø§Ø¹ Ø§Ù„Ø·Ø±Ø¯ Ø¥Ù„Ù‰ Ø§Ù„Ù…ØªØ¬Ø± ðŸ”„' },
  ];

  // 3. Ù‚ÙˆØ§Ù„Ø¨ Ø´ÙˆØ¨ÙŠÙØ§ÙŠ
  const shopifyPresets = [
    { source_status: 'shopify_unfulfilled', display_status: 'ØªÙ… Ø§Ø³ØªÙ„Ø§Ù… ÙˆØªØ£ÙƒÙŠØ¯ Ø·Ù„Ø¨Ùƒ ÙÙŠ Ø§Ù„Ù…ØªØ¬Ø± ðŸ“' },
    { source_status: 'shopify_fulfilled', display_status: 'ØªÙ… ØªØ¬Ù‡ÙŠØ² ÙˆØªØºÙ„ÙŠÙ Ø·Ù„Ø¨Ùƒ ÙˆÙ‡Ùˆ Ø¬Ø§Ù‡Ø² Ù„Ù„Ø´Ø­Ù† ðŸ“¦' },
    { source_status: 'shopify_in_transit', display_status: 'Ø§Ù„Ø´Ø­Ù†Ø© ÙÙŠ Ø·Ø±ÙŠÙ‚Ù‡Ø§ Ø¥Ù„ÙŠÙƒ Ù…Ø¹ Ù…Ù†Ø¯ÙˆØ¨ Ø§Ù„ØªÙˆØµÙŠÙ„ ðŸšš' },
    { source_status: 'shopify_out_for_delivery', display_status: 'Ø§Ù„Ø´Ø­Ù†Ø© Ù…Ø¹ Ø§Ù„Ù…Ù†Ø¯ÙˆØ¨ Ù„Ù„ØªØ³Ù„ÙŠÙ… Ø§Ù„ÙŠÙˆÙ… ðŸ›µ' },
    { source_status: 'shopify_delivered', display_status: 'ØªÙ… ØªØ³Ù„ÙŠÙ… Ø·Ù„Ø¨Ùƒ Ø¨Ù†Ø¬Ø§Ø­ âœ…' },
  ];

  // 4. Ù‚ÙˆØ§Ù„Ø¨ Ø´Ø±ÙƒØ© ZR Express ÙˆÙ…Ø­Ø±Ùƒ Procolis API
  const zrexpressPresets = [
    { source_status: 'pret_a_expedier', display_status: 'ØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø´Ø­Ù†Ø© ÙˆØ¬Ø§Ø±ÙŠ ØªØ¬Ù‡ÙŠØ²Ù‡Ø§ Ù„Ù„Ø§Ø³ØªÙ„Ø§Ù… Ù…Ù† Ø§Ù„Ù…ØªØ¬Ø± ðŸ“¦' },
    { source_status: 'ramasse', display_status: 'Ø§Ø³ØªÙ„Ù… Ù…Ù†Ø¯ÙˆØ¨ ZR Express Ø§Ù„Ø·Ø±Ø¯ ÙˆÙ‡Ùˆ ÙÙŠ Ø·Ø±ÙŠÙ‚Ù‡ Ù„Ù„Ù…Ø±ÙƒØ² Ø§Ù„Ù„ÙˆØ¬Ø³ØªÙŠ ðŸšš' },
    { source_status: 'en_transit', display_status: 'Ø§Ù„Ø´Ø­Ù†Ø© ÙÙŠ Ø·Ø±ÙŠÙ‚Ù‡Ø§ Ø¨ÙŠÙ† Ø§Ù„ÙˆÙ„Ø§ÙŠØ§Øª Ø¹Ø¨Ø± Ø´Ø¨ÙƒØ© Ø§Ù„Ù†Ù‚Ù„ Ø§Ù„Ø³Ø±ÙŠØ¹ ðŸš›' },
    { source_status: 'en_bureau', display_status: 'Ø·Ø±Ø¯Ùƒ Ø¬Ø§Ù‡Ø² Ù„Ù„Ø§Ø³ØªÙ„Ø§Ù… Ø§Ù„Ø¢Ù† Ù…Ù† Ù…ÙƒØªØ¨ ZR Express (Stopdesk) ðŸ¢' },
    { source_status: 'en_livraison', display_status: 'Ø®Ø±Ø¬ Ù„Ù„ØªÙˆØµÙŠÙ„ Ù…Ø¹ Ù…Ù†Ø¯ÙˆØ¨ ZR Express Ø§Ù„ÙŠÙˆÙ…ØŒ ÙŠØ±Ø¬Ù‰ Ø§Ù„Ø§Ù†ØªØ¨Ø§Ù‡ Ù„Ù‡Ø§ØªÙÙƒ ðŸ›µ' },
    { source_status: 'pas_de_reponse', display_status: 'ØªÙ†Ø¨ÙŠÙ‡: Ø­Ø§ÙˆÙ„ Ø§Ù„Ù…Ù†Ø¯ÙˆØ¨ Ø§Ù„Ø§ØªØµØ§Ù„ Ø¨Ùƒ Ù„ØªØ³Ù„ÙŠÙ… Ø§Ù„Ø´Ø­Ù†Ø© ÙˆÙ„Ù… ÙŠØªÙ… Ø§Ù„Ø±Ø¯ âš ï¸' },
    { source_status: 'injoignable', display_status: 'ØªÙ†Ø¨ÙŠÙ‡: Ø±Ù‚Ù… Ù‡Ø§ØªÙÙƒ ØºÙŠØ± Ù…ØªØ§Ø­ Ù„Ø´Ø¨ÙƒØ© Ø§Ù„Ø§ØªØµØ§Ù„ Ù„Ù„ØªÙ†Ø³ÙŠÙ‚ ðŸ“µ' },
    { source_status: 'reporte', display_status: 'ØªÙ… ØªØ£Ø¬ÙŠÙ„ Ù…ÙˆØ¹Ø¯ ØªØ³Ù„ÙŠÙ… Ø§Ù„Ø´Ø­Ù†Ø© Ø¨Ù†Ø§Ø¡Ù‹ Ø¹Ù„Ù‰ Ø±ØºØ¨ØªÙƒ ðŸ—“ï¸' },
    { source_status: 'livre', display_status: 'ØªÙ… ØªØ³Ù„ÙŠÙ… Ø§Ù„Ø´Ø­Ù†Ø© ÙˆØ§Ø³ØªÙ„Ø§Ù… Ø§Ù„Ù…Ø¨Ù„Øº Ù†Ù‚Ø¯Ø§Ù‹ Ø¨Ù†Ø¬Ø§Ø­ âœ…' },
    { source_status: 'retour', display_status: 'ØªØ¹Ø°Ø± ØªØ³Ù„ÙŠÙ… Ø§Ù„Ø´Ø­Ù†Ø© ÙˆØ¬Ø§Ø±ÙŠ Ø¥Ø±Ø¬Ø§Ø¹ Ø§Ù„Ø·Ø±Ø¯ Ø¥Ù„Ù‰ Ø§Ù„Ù…ØªØ¬Ø± ðŸ”„' },
  ];

  // 5. Ù‚ÙˆØ§Ù„Ø¨ Ø´Ø±ÙƒØ© Maystro Delivery
  const maystroPresets = [
    { source_status: 'created', display_status: 'ØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø·Ù„Ø¨ ÙÙŠ Ù†Ø¸Ø§Ù… Maystro ÙˆØ¬Ø§Ø±ÙŠ ØªØ¬Ù‡ÙŠØ²Ù‡ Ù„Ù„ØªØ³Ù„ÙŠÙ… ðŸ“¦' },
    { source_status: 'ramasse', display_status: 'Ø§Ø³ØªÙ„Ù… Ù…Ù†Ø¯ÙˆØ¨ Maystro Delivery Ø§Ù„Ø·Ø±Ø¯ ÙˆÙ‡Ùˆ ÙÙŠ Ø·Ø±ÙŠÙ‚Ù‡ Ù„Ù…Ø±ÙƒØ² Ø§Ù„ÙØ±Ø² ðŸšš' },
    { source_status: 'in_transit', display_status: 'Ø·Ø±Ø¯Ùƒ ÙÙŠ Ø´Ø§Ø­Ù†Ø© Ø§Ù„Ù†Ù‚Ù„ Ø§Ù„Ø³Ø±ÙŠØ¹ Ù…ØªÙˆØ¬Ù‡Ø§Ù‹ Ù†Ø­Ùˆ Ù…Ø±ÙƒØ² ÙˆÙ„Ø§ÙŠØªÙƒ ðŸš›' },
    { source_status: 'point_de_retrait', display_status: 'Ø·Ø±Ø¯Ùƒ Ù…ØªÙˆÙØ± ÙˆØ¬Ø§Ù‡Ø² Ù„Ù„Ø§Ø³ØªÙ„Ø§Ù… Ø§Ù„Ø¢Ù† Ù…Ù† Ù†Ù‚Ø·Ø© Ø§Ø³ØªÙ„Ø§Ù… Maystro ðŸ¢' },
    { source_status: 'at_local_hub', display_status: 'ÙˆØµÙ„ Ø§Ù„Ø·Ø±Ø¯ Ø¥Ù„Ù‰ Ù…Ø±ÙƒØ² Ø§Ù„ØªÙˆØ²ÙŠØ¹ Ø§Ù„Ù…Ø­Ù„ÙŠ Ù„Ù€ Maystro ÙˆØ¬Ø§Ø±ÙŠ Ø§Ù„ÙØ±Ø² ðŸ¢' },
    { source_status: 'out_for_delivery', display_status: 'Ø§Ù„Ù…Ù†Ø¯ÙˆØ¨ ÙÙŠ Ø·Ø±ÙŠÙ‚Ù‡ Ø¥Ù„ÙŠÙƒ Ù„ØªØ³Ù„ÙŠÙ… Ø§Ù„Ø·Ø±Ø¯ Ø§Ù„ÙŠÙˆÙ…ØŒ ÙŠØ±Ø¬Ù‰ Ø¥Ø¨Ù‚Ø§Ø¡ Ù‡Ø§ØªÙÙƒ Ù…ÙØªÙˆØ­Ø§Ù‹ ðŸ›µ' },
    { source_status: 'delivered', display_status: 'ØªÙ… ØªØ³Ù„ÙŠÙ… Ø§Ù„Ø·Ø±Ø¯ Ø¨Ù†Ø¬Ø§Ø­ ÙˆØªØ­ØµÙŠÙ„ Ø§Ù„Ù…Ø¨Ù„ØºØŒ Ø´ÙƒØ±Ø§Ù‹ Ù„Ø«Ù‚ØªÙƒÙ… Ø¨Ù†Ø§! ðŸŽ‰' },
    { source_status: 'attempt_failed_no_answer', display_status: 'ØªØ¹Ø°Ø± Ø§Ù„ØªÙˆØµÙŠÙ„: Ø§Ù„Ø²Ø¨ÙˆÙ† Ù„Ø§ ÙŠØ±Ø¯ Ø¹Ù„Ù‰ Ø§Ù„Ù‡Ø§ØªÙ Ø£Ùˆ Ø§Ù„Ø±Ù‚Ù… Ù…ØºÙ„Ù‚ âš ï¸' },
    { source_status: 'postponed', display_status: 'ØªÙ… ØªØ£Ø¬ÙŠÙ„ Ù…ÙˆØ¹Ø¯ Ø§Ù„ØªØ³Ù„ÙŠÙ… Ø¨Ø·Ù„Ø¨ Ù…Ù† Ø§Ù„Ø²Ø¨ÙˆÙ† Ø¥Ù„Ù‰ ÙˆÙ‚Øª Ù„Ø§Ø­Ù‚ â³' },
    { source_status: 'returned', display_status: 'ØªÙ… Ø¥Ù„ØºØ§Ø¡ Ø§Ù„Ø·Ù„Ø¨ ÙˆÙ‡Ùˆ ÙÙŠ Ø·Ø±ÙŠÙ‚ Ø§Ù„Ø¥Ø±Ø¬Ø§Ø¹ Ø¥Ù„Ù‰ Ù…Ø³ØªÙˆØ¯Ø¹ Ø§Ù„Ù…ØªØ¬Ø± â†©ï¸' },
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

// 3. Ø­ÙØ¸ ÙˆØªØ­Ø¯ÙŠØ« Ø§Ù„Ù‡ÙˆÙŠØ© Ø§Ù„Ø¨ØµØ±ÙŠØ© ÙˆØ§Ù„Ø¹Ù„Ø§Ù…Ø© Ø§Ù„ØªØ¬Ø§Ø±ÙŠØ© (White-Label Branding)
export async function saveBrandSettings(formData: FormData) {
  const merchantId = formData.get('merchant_id') as string;
  if (!merchantId) return { error: 'Ù…Ø¹Ø±Ù‘Ù Ø§Ù„Ù…ØªØ¬Ø± ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯' };

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
    return { error: 'Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø­ÙØ¸ Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ù‡ÙˆÙŠØ© Ø§Ù„Ø¨ØµØ±ÙŠØ©' };
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

// 4. Ø¥Ø±Ø³Ø§Ù„ ÙˆØµÙ„ ØªØ­ÙˆÙŠÙ„ BaridiMob Ù„ØªØ¬Ø¯ÙŠØ¯ / ØªØ±Ù‚ÙŠØ© Ø§Ù„Ø§Ø´ØªØ±Ø§Ùƒ
export async function submitPaymentProof(formData: FormData) {
  const merchantId = formData.get('merchant_id') as string;
  const planTier = (formData.get('plan_tier') as string) || 'basic';
  const amountDzd = parseInt((formData.get('amount_dzd') as string) || '1000', 10);
  const paymentMethod = (formData.get('payment_method') as string) || 'baridimob';
  const transactionRef = (formData.get('transaction_ref') as string)?.trim() || null;
  const paymentProofUrl = (formData.get('payment_proof_url') as string)?.trim() || null;

  if (!merchantId) return { error: 'Ù…Ø¹Ø±Ù‘Ù Ø§Ù„Ù…ØªØ¬Ø± ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯' };
  if (!transactionRef && !paymentProofUrl) {
    return { error: 'ÙŠØ±Ø¬Ù‰ Ø¥Ø¯Ø®Ø§Ù„ Ø±Ù‚Ù… Ø§Ù„Ø¹Ù…Ù„ÙŠØ© Ø§Ù„Ù…Ø±Ø¬Ø¹ÙŠ Ø£Ùˆ Ø±Ø§Ø¨Ø· ØµÙˆØ±Ø© Ø§Ù„ÙˆØµÙ„' };
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
    return { error: 'Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø­ÙØ¸ Ø·Ù„Ø¨ Ø§Ù„ØªØ±Ù‚ÙŠØ©ØŒ ÙŠØ±Ø¬Ù‰ Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø© Ù„Ø§Ø­Ù‚Ø§Ù‹' };
  }

  revalidatePath('/merchant');
  revalidatePath('/admin');
  return { success: true };
}

// 5. ØªÙØ¹ÙŠÙ„ Ø£Ùˆ ØªØ¹Ø·ÙŠÙ„ Ø¥Ø±Ø³Ø§Ù„ Ø±Ø§Ø¨Ø· Ø§Ù„ØªØªØ¨Ø¹ ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ Ø¹Ø¨Ø± ØªÙŠÙ„ÙŠØ¬Ø±Ø§Ù…
export async function toggleTelegramTracking(merchantId: string, enabled: boolean) {
  if (!merchantId) return { error: 'Ù…Ø¹Ø±Ù‘Ù Ø§Ù„Ù…ØªØ¬Ø± ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯' };

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('merchants')
    .update({ telegram_tracking_link_enabled: enabled })
    .eq('id', merchantId);

  if (error) {
    console.error('Error toggling telegram tracking:', error);
    return { error: 'Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ ØªØ­Ø¯ÙŠØ« Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª ØªÙŠÙ„ÙŠØ¬Ø±Ø§Ù…' };
  }

  revalidatePath('/merchant');
  return { success: true };
}

// 6. ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø®Ø±ÙˆØ¬ Ù…Ù† Ù„ÙˆØ­Ø© Ø§Ù„ØªØ§Ø¬Ø±
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

// 7. Ø¥Ù†Ø´Ø§Ø¡ Ø·Ù„Ø¨ ÙŠØ¯ÙˆÙŠ Ù…Ù† Ù„ÙˆØ­Ø© ØªØ­ÙƒÙ… Ø§Ù„ØªØ§Ø¬Ø± (Ù„Ù„Ø§Ø®ØªØ¨Ø§Ø± ÙˆØ§Ù„Ø·Ù„Ø¨Ø§Øª Ø§Ù„ÙŠØ¯ÙˆÙŠØ©)
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
    return { error: 'Ù…Ø¹Ø±Ù‘Ù Ø§Ù„Ù…ØªØ¬Ø± ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯' };
  }
  if (!customerPhone) {
    return { error: 'ÙŠØ±Ø¬Ù‰ Ø¥Ø¯Ø®Ø§Ù„ Ø±Ù‚Ù… Ù‡Ø§ØªÙ Ø§Ù„Ø¹Ù…ÙŠÙ„' };
  }

  const supabase = getSupabaseAdminClient();

  // Ø¥Ø°Ø§ ØªÙ… Ø§Ø®ØªÙŠØ§Ø± ØªÙŠÙ„ÙŠØ¬Ø±Ø§Ù… ÙˆÙƒØ§Ù† Ø®ÙŠØ§Ø± Ø§Ù„Ù…ØªØ¬Ø± Ù…Ø¹Ø·Ù„Ø§Ù‹ØŒ Ù†Ù‚ÙˆÙ… Ø¨ØªÙØ¹ÙŠÙ„Ù‡ Ù„Ø¶Ù…Ø§Ù† Ø¥Ø¯Ø±Ø§Ø¬ Ù…Ù‡Ù…Ø© Ø§Ù„Ø¥Ø±Ø³Ø§Ù„ ÙÙŠ Ø§Ù„Ù€ Outbox
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
    description: 'ØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø·Ù„Ø¨ ÙŠØ¯ÙˆÙŠØ§Ù‹ Ù…Ù† Ù„ÙˆØ­Ø© Ø§Ù„ØªØ§Ø¬Ø±',
    customerTelegramConsent: telegramConsent,
    telegramConsentSource: 'merchant_manual_test',
    telegramConsentVersion: 'v1',
  });

  if (!result.success) {
    return { error: result.message || 'Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø¥Ø¶Ø§ÙØ© Ø§Ù„Ø·Ù„Ø¨' };
  }

  revalidatePath('/merchant');
  return {
    success: true,
    trackingUuid: result.trackingUuid,
    externalOrderId,
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
    return { error: 'ÙŠØ±Ø¬Ù‰ Ø¥Ø¯Ø®Ø§Ù„ Ø±Ø§Ø¨Ø· Ø§Ù„Ù…Ù†ØªØ¬' };
  }

  let validUrl: URL;
  try {
    validUrl = new URL(url.trim());
    if (!['http:', 'https:'].includes(validUrl.protocol)) {
      return { error: 'ÙŠØ¬Ø¨ Ø£Ù† ÙŠØ¨Ø¯Ø£ Ø§Ù„Ø±Ø§Ø¨Ø· Ø¨Ù€ http:// Ø£Ùˆ https://' };
    }
  } catch {
    return { error: 'Ø§Ù„Ø±Ø§Ø¨Ø· ØºÙŠØ± ØµØ§Ù„Ø­ØŒ ÙŠØ±Ø¬Ù‰ Ø§Ù„ØªØ£ÙƒØ¯ Ù…Ù†Ù‡' };
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
              const price = rawPrice ? `${rawPrice} Ø¯.Ø¬` : '';

              return {
                success: true,
                title: title || 'Ù…Ù†ØªØ¬ Ø¬Ø¯ÙŠØ¯',
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
          'Ø§Ù„Ù…ÙˆÙ‚Ø¹ ÙŠØ·Ø¨Ù‚ Ø¬Ø¯Ø§Ø± Ø­Ù…Ø§ÙŠØ© Ø¶Ø¯ Ø§Ù„Ø±ÙˆØ¨ÙˆØªØ§Øª ÙˆØ§Ù„Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ù…ØªÙƒØ±Ø±Ø© (Rate Limit 429). ÙŠÙ…ÙƒÙ†Ùƒ ÙƒØªØ§Ø¨Ø© Ø§Ø³Ù… ÙˆØµÙˆØ±Ø© Ø§Ù„Ù…Ù†ØªØ¬ ÙŠØ¯ÙˆÙŠØ§Ù‹ ÙˆØ³ÙŠØ¹Ù…Ù„ Ù…Ø¨Ø§Ø´Ø±Ø©.',
      };
    }

    if (response.status === 403) {
      return {
        error:
          'Ø§Ù„Ù…ÙˆÙ‚Ø¹ Ù…Ø­Ù…ÙŠ Ø¨Ø¬Ø¯Ø§Ø± Ø­Ù…Ø§ÙŠØ© Ø¶Ø¯ Ø§Ù„ÙƒØ´Ø· (403 Forbidden). ÙŠÙ…ÙƒÙ†Ùƒ Ø¥Ø¯Ø®Ø§Ù„ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ù†ØªØ¬ ÙŠØ¯ÙˆÙŠØ§Ù‹.',
      };
    }

    if (!response.ok) {
      return { error: `ØªØ¹Ø°Ø± Ø§Ù„Ø§ØªØµØ§Ù„ Ø¨ØµÙØ­Ø© Ø§Ù„Ù…Ù†ØªØ¬ (Ø±Ù…Ø² Ø§Ù„Ø­Ø§Ù„Ø©: ${response.status})` };
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
      title: title || 'Ù…Ù†ØªØ¬ Ø¬Ø¯ÙŠØ¯',
      image_url: imageUrl || '',
      price: price || null,
      product_url: validUrl.href,
    };
  } catch (err: any) {
    console.warn('[MetadataScraper]: Error fetching URL:', err?.message || err);
    return {
      error: 'ØªØ¹Ø°Ø± Ø¬Ù„Ø¨ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ØŒ ÙŠÙ…ÙƒÙ†Ùƒ Ø¥Ø¯Ø®Ø§Ù„ Ø§Ø³Ù… ÙˆØµÙˆØ±Ø© Ø§Ù„Ù…Ù†ØªØ¬ ÙŠØ¯ÙˆÙŠØ§Ù‹',
    };
  }
}

export async function getMerchantUpsells() {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return { error: 'ØºÙŠØ± Ù…ØµØ±Ø­' };

  const supabaseAdmin = getSupabaseAdminClient();
  const { data: merchant } = await supabaseAdmin
    .from('merchants')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!merchant) return { error: 'Ù…Ù„Ù Ø§Ù„ØªØ§Ø¬Ø± ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯' };

  const { data: upsells, error } = await supabaseAdmin
    .from('merchant_upsells')
    .select('*')
    .eq('merchant_id', merchant.id)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching upsells:', error);
    return { error: 'ÙØ´Ù„ Ø¬Ù„Ø¨ Ø§Ù„Ù…Ù†ØªØ¬Ø§Øª' };
  }

  return { success: true, upsells: upsells || [] };
}

export async function saveMerchantUpsell(formData: FormData) {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return { error: 'ØºÙŠØ± Ù…ØµØ±Ø­' };

  const supabaseAdmin = getSupabaseAdminClient();
  const { data: merchant } = await supabaseAdmin
    .from('merchants')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!merchant) return { error: 'Ù…Ù„Ù Ø§Ù„ØªØ§Ø¬Ø± ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯' };

  const id = (formData.get('id') as string)?.trim() || undefined;
  const title = (formData.get('title') as string)?.trim();
  const imageUrl = (formData.get('image_url') as string)?.trim();
  const productUrl = (formData.get('product_url') as string)?.trim();
  const price = (formData.get('price') as string)?.trim() || null;
  const isActive = formData.get('is_active') === 'true' || formData.get('is_active') === 'on';

  if (!title || !imageUrl || !productUrl) {
    return { error: 'ÙŠØ±Ø¬Ù‰ Ù…Ù„Ø¡ Ø§Ù„Ø­Ù‚ÙˆÙ„ Ø§Ù„Ø£Ø³Ø§Ø³ÙŠØ©: Ø§Ù„Ø¹Ù†ÙˆØ§Ù†ØŒ Ø§Ù„ØµÙˆØ±Ø©ØŒ ÙˆØ±Ø§Ø¨Ø· Ø§Ù„Ù…Ù†ØªØ¬' };
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
      return { error: 'ÙØ´Ù„ ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ù…Ù†ØªØ¬' };
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
      return { error: 'ÙØ´Ù„ Ø¥Ø¶Ø§ÙØ© Ø§Ù„Ù…Ù†ØªØ¬' };
    }
  }

  revalidatePath('/merchant');
  return { success: true };
}

export async function reorderMerchantUpsell(id: string, direction: 'up' | 'down') {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return { error: 'ØºÙŠØ± Ù…ØµØ±Ø­' };

  const supabaseAdmin = getSupabaseAdminClient();
  const { data: merchant } = await supabaseAdmin
    .from('merchants')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!merchant) return { error: 'Ù…Ù„Ù Ø§Ù„ØªØ§Ø¬Ø± ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯' };

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
  if (currentIndex === -1) return { error: 'Ø§Ù„Ù…Ù†ØªØ¬ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯' };

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
  if (!user) return { error: 'ØºÙŠØ± Ù…ØµØ±Ø­' };

  const supabaseAdmin = getSupabaseAdminClient();
  const { data: merchant } = await supabaseAdmin
    .from('merchants')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!merchant) return { error: 'Ù…Ù„Ù Ø§Ù„ØªØ§Ø¬Ø± ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯' };

  const { error } = await supabaseAdmin
    .from('merchant_upsells')
    .delete()
    .eq('id', id)
    .eq('merchant_id', merchant.id);

  if (error) {
    console.error('Error deleting upsell:', error);
    return { error: 'ÙØ´Ù„ Ø­Ø°Ù Ø§Ù„Ù…Ù†ØªØ¬' };
  }

  revalidatePath('/merchant');
  return { success: true };
}

export async function toggleMerchantUpsell(id: string, isActive: boolean) {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return { error: 'ØºÙŠØ± Ù…ØµØ±Ø­' };

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
