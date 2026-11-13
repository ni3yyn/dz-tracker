'use server';

import { createHash, randomBytes } from 'node:crypto';
import { redirect } from 'next/navigation';
import { getSupabaseAdminClient } from '@saas/database';
import { createClient } from '../../../../lib/supabase-server';
import { isAuthorizedAdmin } from '../../../../lib/admin-auth';
import { LEGAL_TERMS_VERSION, LEGAL_PRIVACY_VERSION } from '../../../../lib/legal';

const PAIRING_PATH = '/mobile/sms-gateway/connect';
const APP_REDIRECT = 'tajertrack-sms://pair';

function connectErrorUrl(error: string) {
  return `${PAIRING_PATH}?redirect_uri=${encodeURIComponent(APP_REDIRECT)}&error=${encodeURIComponent(error)}`;
}

export async function approveNativeSmsDevice(formData: FormData) {
  const supabaseAuth = await createClient();
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

  if (authError || !user) {
    redirect(`/login?next=${encodeURIComponent(PAIRING_PATH)}`);
  }

  if (isAuthorizedAdmin(user)) {
    redirect('/admin');
  }

  if (formData.get('acceptTerms') !== 'yes' || formData.get('acceptPrivacy') !== 'yes') {
    redirect(connectErrorUrl('legal_required'));
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

  const { error: acceptanceError } = await supabase
    .from('merchant_legal_acceptances')
    .upsert({
      user_id: user.id,
      merchant_id: merchant.id,
      terms_version: LEGAL_TERMS_VERSION,
      privacy_version: LEGAL_PRIVACY_VERSION,
      accepted_at: new Date().toISOString(),
      acceptance_source: 'native_sms_gateway_pairing',
    }, {
      onConflict: 'user_id,terms_version,privacy_version',
    });

  if (acceptanceError) {
    console.error('[NativeSmsGateway] Could not save legal acceptance:', acceptanceError.message);
    redirect(connectErrorUrl('legal_acceptance_unavailable'));
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
