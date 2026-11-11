import { createClient } from './supabase-server';

type AdminIdentity = {
  id: string;
  email?: string | null;
};

/** The identity is always taken from Supabase Auth on the server. */
export function isAdminConfigured(): boolean {
  return Boolean(process.env.ADMIN_USER_ID?.trim() || process.env.ADMIN_EMAIL?.trim());
}

/** ADMIN_USER_ID is the preferred immutable allowlist key; email is fallback only. */
export function isAuthorizedAdmin(user: AdminIdentity | null | undefined): boolean {
  if (!user?.id) return false;

  const configuredUserId = process.env.ADMIN_USER_ID?.trim();
  if (configuredUserId) return user.id === configuredUserId;

  const configuredEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!configuredEmail) return false;
  return user.email?.trim().toLowerCase() === configuredEmail;
}

/** Re-check authorization for every privileged Server Action. */
export async function isCurrentUserAdmin(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    return !error && isAuthorizedAdmin(user);
  } catch {
    return false;
  }
}
