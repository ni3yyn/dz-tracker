'use server';

import { createHash, randomBytes } from 'node:crypto';
import { redirect } from 'next/navigation';
import { getSupabaseAdminClient } from '@saas/database';
import { createClient } from '../../../../lib/supabase-server';
import { isAuthorizedAdmin } from '../../../../lib/admin-auth';
import { LEGAL_TERMS_VERSION, LEGAL_PRIVACY_VERSION } from '../../../../lib/legal';

const PAIRING_PATH = '/mobile/sms-gateway/connect';
const APP_REDIRECT = 'tajertrack-sms://pair';

function normalizeAlgerianMobileNumber(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let value = input.trim().replace(/[\\s().-]/g, '');
  if (value.startsWith('00')) value = `+${value.slice(2)}`;
  if (value.startsWith('213')) value = `+${value}`;
  if (/^0[5-7]\\d{8}$/.test(value)) value = `+213${value.slice(1)}`;
  return /^\\+213[5-7]\\d{8}$/.test(value) ? value : null;
}

function connectErrorUrl(error: string) {
  return `${PAIRING_PATH}?redirect_uri=${encodeURIComponent(APP_REDIRECT)}&error=${encodeURIComponent(error)}`;
}

export async function approveNativeSmsDevice(formData: FormData) {
  const supabaseAuth = await createClient();
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

  if (authError || !user) {
    const nextPath = `${PAIRING_PATH}?redirect_uri=${encodeURIComponent(APP_REDIRECT)}`;
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  if (isAuthorizedAdmin(user)) {
    redirect('/admin');
  }

  const merchantPhone = normalizeAlgerianMobileNumber(formData.get('phoneNumber'));
  if (!merchantPhone) {
    redirect(connectErrorUrl('invalid_phone'));
  }

  const supabase = getSupabaseAdminClient() as any;
  const { data: merchant, error: merchantError } = await supabase
    .from('merchants')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (merchantError || !merchant?.id) {
    redirect(connectErrorUrl('merchant_unavailable'));
  }

  // Reuse the consent captured during signup. Never overwrite its original
  // timestamp or source just because the merchant is pairing another phone.
  const { data: existingAcceptance, error: acceptanceLookupError } = await supabase
    .from('merchant_legal_acceptances')
    .select('id')
    .eq('user_id', user.id)
    .eq('terms_version', LEGAL_TERMS_VERSION)
    .eq('privacy_version', LEGAL_PRIVACY_VERSION)
    .maybeSingle();

  if (acceptanceLookupError) {
    console.error('[NativeSmsGateway] Could not verify legal acceptance:', acceptanceLookupError.message);
    redirect(connectErrorUrl('legal_acceptance_unavailable'));
  }

  if (!existingAcceptance) {
    if (formData.get('acceptTerms') !== 'yes' || formData.get('acceptPrivacy') !== 'yes') {
      redirect(connectErrorUrl('legal_required'));
    }

    const { error: acceptanceInsertError } = await supabase
      .from('merchant_legal_acceptances')
      .insert({
        user_id: user.id,
        merchant_id: merchant.id,
        terms_version: LEGAL_TERMS_VERSION,
        privacy_version: LEGAL_PRIVACY_VERSION,
        accepted_at: new Date().toISOString(),
        acceptance_source: 'native_sms_gateway_pairing',
      });

    // A concurrent request may have saved the same version after our lookup.
    if (acceptanceInsertError && acceptanceInsertError.code !== '23505') {
      console.error('[NativeSmsGateway] Could not save legal acceptance:', acceptanceInsertError.message);
      redirect(connectErrorUrl('legal_acceptance_unavailable'));
    }
  }

  const { error: phoneUpdateError } = await supabaseAuth.auth.updateUser({
    data: { merchant_phone: merchantPhone },
  });
  if (phoneUpdateError) {
    console.error('[NativeSmsGateway] Could not save merchant phone number:', phoneUpdateError.message);
    redirect(connectErrorUrl('phone_save_failed'));
  }

  // The one-time code is high entropy, expires in five minutes, and only its
  // SHA-256 digest is persisted. It never contains or exposes a Supabase token.
  const code = randomBytes(32).toString('base64url');
  const codeHash = createHash('sha256').update(code, 'utf8').digest('hex');
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const { error: insertError } = await supabase
    .from('sms_gateway_pairing_codes')
    .insert({
      code_hash: codeHash,
      merchant_id: merchant.id,
      created_by: user.id,
      expires_at: expiresAt,
    });

  if (insertError) {
    console.error('[NativeSmsGateway] Could not create a pairing code:', insertError.message);
    redirect(connectErrorUrl('pairing_unavailable'));
  }

  redirect(`${APP_REDIRECT}?code=${encodeURIComponent(code)}`);
}
