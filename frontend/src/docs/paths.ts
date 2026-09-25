export const paths = {
  home: "/",
  review: "/review",
  dashboard: "/dashboard",
  account: "/account",
  docs: "/docs",
  signIn: "/sign-in",
  register: "/register",
} as const;

export function docPath(
  pageId: string,
  headingId: string | null = null,
): string {
  return headingId ? `/docs/${pageId}/${headingId}` : `/docs/${pageId}`;
}

export function parseDocPath(pathname: string): {
  pageId: string | undefined;
  headingId: string | null;
} {
  const parts = pathname.split("/").filter(Boolean);
  const tokens = parts[0] === "docs" ? parts.slice(1) : parts;
  return {
    pageId: tokens[0],
    headingId: tokens[1] || null,
  };
}

export function isReviewPath(pathname: string): boolean {
  return pathname === paths.home || pathname === paths.review;
}

export function isDashboardPath(pathname: string): boolean {
  return pathname === paths.dashboard;
}
