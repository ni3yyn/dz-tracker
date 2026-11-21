import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  // Pairing codes are single-use bearer credentials. Never cache the callback
  // page or allow its URL to become a referrer to another origin.
  if (pathname === '/mobile/sms-gateway/complete') {
    const response = NextResponse.next({ request });
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
  }
  const needsDashboardLogin = pathname.startsWith('/merchant') || pathname.startsWith('/admin');
  // Carrier-scoped invitations are bearer-token flows and must work for recipients without TajerTrack accounts.
  // Keep the normal manager-pairing route protected; only a non-empty invite token bypasses this login gate.
  const isNativeSmsInvite = pathname === '/mobile/sms-gateway/connect' && Boolean(request.nextUrl.searchParams.get('invite')?.trim());
  const needsNativeSmsLogin = pathname === '/mobile/sms-gateway/connect' && !isNativeSmsInvite;
  const isLoginPage = pathname === '/login';
  const hasSupabaseSessionCookie = request.cookies.getAll().some(({ name }) =>
    name.startsWith('sb-') && name.includes('auth-token')
  );

  // Anonymous public requests (including search crawlers) do not need a
  // Supabase session lookup. Keep auth refresh for signed-in visitors.
  if (!needsDashboardLogin && !needsNativeSmsLogin && !isLoginPage && !hasSupabaseSessionCookie) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const configuredAdminId = process.env.ADMIN_USER_ID?.trim();
  const configuredAdminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminAllowlistConfigured = Boolean(configuredAdminId || configuredAdminEmail);
  const isAdmin = Boolean(user && (
    configuredAdminId
      ? user.id === configuredAdminId
      : configuredAdminEmail && user.email?.trim().toLowerCase() === configuredAdminEmail
  ));

  if (
    user &&
    request.nextUrl.pathname.startsWith('/admin') &&
    adminAllowlistConfigured &&
    !isAdmin
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/merchant';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Preserve the native-phone approval URL through sign-in so the merchant
  // returns directly to the pairing confirmation after authenticating.
  if (!user && (needsDashboardLogin || needsNativeSmsLogin)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    if (needsNativeSmsLogin) {
      url.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
    }
    return NextResponse.redirect(url);
  }

  // إذا كان مسجل دخول ويحاول فتح صفحة تسجيل الدخول، نوجهه للوحة المناسبة
  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    if (isAdmin) {
      url.pathname = '/admin';
    } else {
      url.pathname = '/merchant';
    }
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|t/.*).*)'],
};