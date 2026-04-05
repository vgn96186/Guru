type RouteStateLike = {
  index?: number;
  routes?: Array<{
    name: string;
    state?: RouteStateLike;
  }>;
};

const ACTION_HUB_BLOCKED_ROUTES = new Set(['Session', 'LectureMode', 'MockTest', 'Review']);

export function getDeepestFocusedRouteName(state?: RouteStateLike): string | undefined {
  if (!state?.routes?.length) return undefined;
  const index = state.index ?? 0;
  const route = state.routes[index];
  if (!route) return undefined;
  return getDeepestFocusedRouteName(route.state) ?? route.name;
}

export function isActionHubAllowedForRoute(routeName?: string): boolean {
  return routeName ? !ACTION_HUB_BLOCKED_ROUTES.has(routeName) : true;
}
