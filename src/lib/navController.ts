'use client';
import { haptic } from './haptics';
import { navReduce, type NavEvent } from './navMachine';
import { navRuntime } from './navRuntime';
import { sfx } from './sfx';
import { locateThen } from '@/hooks/useLocation';
import { cameraCommands } from '@/scene/CameraRig';
import { useApp, type Endpoint } from '@/store/useApp';

/** How long the "You have arrived" toast stays before the destination card comes back at peek. */
export const ARRIVED_HOLD_MS = 2500;

/** Feed one event to the navigation state machine and run its effects. The only writer of `nav`. */
export function navDispatch(ev: NavEvent) {
  const s = useApp.getState();
  const { state, effects } = navReduce(s.nav, ev);
  if (state === s.nav && !effects.length) return;
  useApp.setState({ nav: state });
  for (const e of effects) {
    switch (e) {
      case 'fitRoute':
        if (s.route) cameraCommands.fitPoints(s.route.path);
        break;
      case 'enterFollow':
        // Tilt 0 for navigation: remember the user's choice and restore it at the end. The 2D/3D button still
        // works during navigation, and that choice is respected.
        useApp.setState({
          navPrevTopDown: s.navPrevTopDown ?? s.topDown,
          topDown: true,
          navSnap: 'peek',
          locate: s.locate === 'off' ? 'on' : s.locate,
        });
        navRuntime.lastTouch = performance.now();
        cameraCommands.navFollow(true);
        break;
      case 'flyToUser':
        navRuntime.lastTouch = performance.now();
        cameraCommands.navFollow(false);
        break;
      case 'arrived': {
        haptic([20, 70, 20]);
        sfx.arrive();
        s.setToast(`You have arrived at ${s.to?.name ?? 'your destination'}`);
        setTimeout(() => navDispatch({ type: 'ARRIVED_DONE' }), ARRIVED_HOLD_MS);
        break;
      }
      case 'showDestinationCard': {
        const id = s.to?.id;
        endRouteState();
        if (id) {
          useApp.getState().select(id);
          useApp.setState({ cardSnap: 'peek' });
        }
        break;
      }
      case 'restoreCamera': {
        const prev = useApp.getState().navPrevTopDown;
        if (prev != null) useApp.setState({ topDown: prev, navPrevTopDown: null });
        if (ev.type === 'END') endRouteState();
        break;
      }
    }
  }
}

/**
 * Directions to a place: route preview starting from "My location" (no start picker). Location permission is
 * requested here, once, from the user's tap. If no fix comes (denied, unavailable, off campus) the user gets a chip,
 * never a popup.
 */
export function startDirections(to: Endpoint) {
  const s = useApp.getState();
  s.set({
    to,
    navOpen: true,
    navSnap: 'peek',
    startPickerOpen: false,
    from: s.userPos ? { name: 'My location', pos: s.userPos } : null,
  });
  navDispatch({ type: 'DESTINATION' });
  if (!s.userPos)
    locateThen((p) => {
      const t = useApp.getState();
      if (t.navOpen && !t.from) t.set({ from: { name: 'My location', pos: p } });
    });
}

/** The x / pull-down on the directions sheet: always ends the route, whatever the state. */
export function endNavigation() {
  if (useApp.getState().nav === 'IDLE') endRouteState();
  else navDispatch({ type: 'END' });
}

function endRouteState() {
  navRuntime.progressM = 0;
  navRuntime.stepFromM = 0;
  navRuntime.stepToM = 0;
  navRuntime.lastRerouteAt = 0;
  const s = useApp.getState();
  s.setChip(null, 'pickStart');
  s.setChip(null, 'offCampus');
  useApp.setState({
    navOpen: false,
    from: null,
    to: null,
    route: null,
    pickMode: null,
    navStep: 0,
    startPickerOpen: false,
    locate: s.locate === 'follow' ? 'on' : s.locate,
  });
}
