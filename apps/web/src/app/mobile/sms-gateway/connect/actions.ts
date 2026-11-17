'use server';

import { randomBytes } from 'node:crypto';
import { redirect } from 'next/navigation';
import { getSupabaseAdminClient } from '@saas/database';
import { createClient } from '../../../../lib/supabase-server';
import { isAuthorizedAdmin } from '../../../../lib/admin-auth';
import { hashNativeSmsCredential } from '../../../../lib/native-sms-gateway-auth';

const PAIRING_PATH = '/mobile/sms-gateway/connect';
const MANAGER_REDIRECT = 'tajertrack-sms://manager-pair';
const SENDER_REDIRECT = 'tajertrack-sms://pair';

function connectErrorUrl(error: string, managerDeviceId = '', deviceModel = '') {
  const params = new URLSearchParams({
    redirect_uri: MANAGER_REDIRECT,
    error,
  });
  if (/^[A-Za-z0-9_-]{8,80}$/.test(managerDeviceId)) {
    params.set('manager_device_id', managerDeviceId);
  }
  if (deviceModel) params.set('device_model', deviceModel);
  return `${PAIRING_PATH}?${params.toString()}`;
}

function normalizeDeviceModel(value: string | null | undefined) {
  return (value || '').trim().replace(/\\s+/g, ' ').toLowerCase();
}

/** The normal account-authenticated flow establishes the one merchant manager device. */
export async function approveNativeSmsDevice(formData: FormData) {
  const managerDeviceId = String(formData.get('managerDeviceId') || '').trim();
  const suppliedManagerDeviceId = /^[A-Za-z0-9_-]{8,80}$/.test(managerDeviceId) ? managerDeviceId : '';
  const deviceModel = String(formData.get('deviceModel') || '').trim().replace(/\\s+/g, ' ').slice(0, 80);
  const normalizedDeviceModel = normalizeDeviceModel(deviceModel);
  if (!normalizedDeviceModel) {
    redirect(connectErrorUrl('device_model_missing', suppliedManagerDeviceId));
  }

  const supabaseAuth = await createClient();
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

  if (authError || !user) {
    const managerQuery = suppliedManagerDeviceId
      ? `&manager_device_id=${encodeURIComponent(suppliedManagerDeviceId)}`
      : '';
    const nextPath = `${PAIRING_PATH}?redirect_uri=${encodeURIComponent(MANAGER_REDIRECT)}${managerQuery}&device_model=${encodeURIComponent(deviceModel)}`;
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  if (isAuthorizedAdmin(user)) redirect('/admin');

  const supabase = getSupabaseAdminClient() as any;
  const { data: merchant, error: merchantError } = await supabase
    .from('merchants')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (merchantError) {
    console.error('[NativeSmsGateway] Merchant lookup failed before manager pairing:', {
      code: merchantError.code,
      message: merchantError.message,
      details: merchantError.details,
      hint: merchantError.hint,
    });
    redirect(connectErrorUrl('merchant_lookup_failed', suppliedManagerDeviceId, deviceModel));
  }
  if (!merchant?.id) redirect(connectErrorUrl('merchant_unavailable', suppliedManagerDeviceId, deviceModel));


  const { data: existingManager, error: managerError } = await supabase
    .from('sms_gateway_manager_devices')
    .select('manager_device_id, enabled, display_name')
    .eq('merchant_id', merchant.id)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (managerError) {
    console.error('[NativeSmsGateway] Existing manager check failed:', managerError.message);
    redirect(connectErrorUrl('pairing_unavailable', suppliedManagerDeviceId, deviceModel));
  }

  const sameManagerDevice = Boolean(
    existingManager?.manager_device_id &&
    existingManager.enabled === true &&
    suppliedManagerDeviceId &&
    existingManager.manager_device_id === suppliedManagerDeviceId
  );
  if (sameManagerDevice) {
    redirect(connectErrorUrl('', suppliedManagerDeviceId, deviceModel));
  }

  const replaceExisting = Boolean(existingManager?.manager_device_id);
  const registeredDeviceModel = normalizeDeviceModel(existingManager?.display_name);
  const requiresReplacementConfirmation = replaceExisting &&
    registeredDeviceModel !== normalizedDeviceModel;
  if (requiresReplacementConfirmation && formData.get('replaceExisting') !== 'yes') {
    redirect(connectErrorUrl('manager_replacement_required', suppliedManagerDeviceId, deviceModel));
  }

  const code = randomBytes(32).toString('base64url');
  const { error: insertError } = await supabase
    .from('sms_gateway_manager_pairing_codes')
    .insert({
      code_hash: hashNativeSmsCredential(code),
      merchant_id: merchant.id,
      created_by: user.id,
      operator_code: null,
      replace_existing: replaceExisting,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });

  if (insertError) {
    console.error('[NativeSmsGateway] Could not create a manager pairing code:', {
      code: insertError.code,
      message: insertError.message,
      details: insertError.details,
      hint: insertError.hint,
    });
    redirect(connectErrorUrl('pairing_code_create_failed', suppliedManagerDeviceId, deviceModel));
  }

  redirect(`${MANAGER_REDIRECT}?code=${encodeURIComponent(code)}`);
}

/** Redeems a merchant-created, carrier-scoped invitation without requiring the recipient to log in. */
export async function approveNativeSmsInvite(formData: FormData) {
  const invite = String(formData.get('invite') || '').trim();
  const invitePage = `${PAIRING_PATH}?invite=${encodeURIComponent(invite)}`;
  if (!/^[A-Za-z0-9_-]{30,100}$/.test(invite)) {
    redirect(`${PAIRING_PATH}?error=invite_invalid`);
  }

  const code = randomBytes(32).toString('base64url');
  const supabase = getSupabaseAdminClient() as any;
  const { data, error } = await supabase.rpc('redeem_native_sms_gateway_invite', {
    p_invite_hash: hashNativeSmsCredential(invite),
    p_code_hash: hashNativeSmsCredential(code),
  });

  if (error) {
    console.error('[NativeSmsGateway] Invite redemption failed:', error.message);
    redirect(`${invitePage}&error=invite_unavailable`);
  }

  const redemption = Array.isArray(data) ? data[0] : data;
  if (!redemption?.merchant_id || !redemption?.operator_code) {
    redirect(`${invitePage}&error=invite_expired`);
  }

  redirect(`${SENDER_REDIRECT}?code=${encodeURIComponent(code)}`);
}
