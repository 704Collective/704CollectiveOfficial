/** Shared dashboard content width — aligns with Header (`max-w-5xl`). */
export const DASHBOARD_MAIN =
  'w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8';

/** Wider shell for multi-column grids (directory, partners, hubs). */
export const DASHBOARD_MAIN_WIDE =
  'w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8';

/**
 * Matches Header inner width so tab bar lines up with main content.
 * Render `<DashboardNav />` as a sibling of `<main>`, not inside it — nesting inside
 * `<main>` doubles horizontal padding and narrows the tab row; with `overflow-x: hidden`
 * on html/body that can clip the last labels (e.g. Settings).
 */
export const DASHBOARD_NAV_SHELL =
  'relative mx-auto w-full min-w-0 max-w-5xl px-4 sm:px-6 lg:px-8';

/** Desktop tab strip — wider than main so more tabs fit on one row; horizontal scroll + thin scrollbar when needed. */
export const DASHBOARD_NAV_DESKTOP =
  'mx-auto w-full min-w-0 max-w-7xl px-4 sm:px-6 lg:px-8';
