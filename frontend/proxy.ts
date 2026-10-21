import { NextResponse, type NextRequest } from 'next/server';

/**
 * Optimistic route guard: bounce visitors without a session cookie to the right sign-in page.
 * This is a UX convenience only — every API call is authorised by the backend.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    if (!req.cookies.get('libra_admin')) {
      const url = req.nextUrl.clone();
      url.pathname = '/admin/login';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  if (pathname.startsWith('/exam') && !req.cookies.get('libra_candidate')) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/exam/:path*', '/exam'],
};
