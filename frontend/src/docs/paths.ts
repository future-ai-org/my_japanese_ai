export const paths = {
  home: "/",
  review: "/review",
  dashboard: "/dashboard",
  account: "/account",
  signIn: "/sign-in",
  register: "/register",
} as const;

export function isReviewPath(pathname: string): boolean {
  return pathname === paths.home || pathname === paths.review;
}

export function isDashboardPath(pathname: string): boolean {
  return pathname === paths.dashboard;
}
