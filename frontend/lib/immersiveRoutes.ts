export function isImmersiveRoute(pathname: string): boolean {
  if (!pathname) return false;

  if (pathname === "/daily-log") return true;
  if (pathname.startsWith("/daily-log/") && pathname !== "/daily-log/archive") return true;

  if (pathname === "/research-notes/new") return true;
  if (/^\/research-notes\/[^/]+$/.test(pathname)) return true;

  if (pathname === "/shared/new") return true;
  if (/^\/shared\/articles\/[^/]+$/.test(pathname)) return true;
  if (/^\/shared\/feed\/[^/]+$/.test(pathname)) return true;

  return false;
}
