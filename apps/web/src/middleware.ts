import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
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
  const needsDashboardLogin =
    request.nextUrl.pathname.startsWith('/merchant') ||
    request.nextUrl.pathname.startsWith('/admin');
  const needsNativeSmsLogin = request.nextUrl.pathname === '/mobile/sms-gateway/connect';

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
  if (user && request.nextUrl.pathname === '/login') {
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