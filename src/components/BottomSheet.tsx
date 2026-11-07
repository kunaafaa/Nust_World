'use client';
import { animate, motion, useMotionValue } from 'framer-motion';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '@/store/useApp';

export type Snap = 'peek' | 'half' | 'full';
const ORDER: Snap[] = ['peek', 'half', 'full'];

/** Viewport metrics. `side` = wide or short screens (desktop, phone landscape): the sheet becomes a left panel. */
function useViewport() {
  const [v, setV] = useState({ w: 390, h: 800, sab: 0 });
  useLayoutEffect(() => {
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;visibility:hidden;padding-bottom:env(safe-area-inset-bottom,0px)';
    document.body.appendChild(probe);
    const read = () =>
      setV({
        w: window.innerWidth,
        h: window.innerHeight,
        sab: parseFloat(getComputedStyle(probe).paddingBottom) || 0,
      });
    read();
    window.addEventListener('resize', read);
    return () => {
      window.removeEventListener('resize', read);
      probe.remove();
    };
  }, []);
  return { ...v, side: v.w >= 768 || v.h < 500 };
}

/** Pure snap maths, exported for tests. offsets are px the sheet is pushed down from its fully-open position. */
export function snapOffsets(h: number, side: boolean, peek: number, sab: number) {
  const full = side ? Math.max(200, h - 136) : Math.round(h * 0.9);
  const half = Math.min(full, Math.round(h * (side ? 0.55 : 0.45)));
  const pk = peek + sab;
  return {
    full,
    offsets: { full: 0, half: full - half, peek: full - pk } as Record<Snap, number>,
    heights: { full, half, peek: pk },
  };
}

/** Velocity-aware snap choice. From peek a hard pull down dismisses; from half it only returns to peek. */
export function chooseSnap(
  y: number,
  v: number,
  from: Snap,
  offsets: Record<Snap, number>,
): Snap | 'close' {
  if (from === 'peek' && (y > offsets.peek + 48 || v > 700)) return 'close';
  const proj = y + v * 0.18;
  let best: Snap = 'peek',
    d = Infinity;
  for (const s of ORDER) {
    const dd = Math.abs(proj - offsets[s]);
    if (dd < d) {
      d = dd;
      best = s;
    }
  }
  return best;
}

export function BottomSheet({
  open,
  snap,
  onSnap,
  onClose,
  label,
  header,
  children,
  peek = 96,
  dim = false,
}: {
  open: boolean;
  snap: Snap;
  onSnap: (s: Snap) => void;
  onClose: () => void;
  label: string;
  /** Always visible (the peek content). Dragging it moves the sheet. */
  header: ReactNode;
  children: ReactNode;
  peek?: number;
  dim?: boolean;
}) {
  const vp = useViewport();
  const { full, offsets, heights } = snapOffsets(vp.h, vp.side, peek, vp.sab);
  const y = useMotionValue(full + 40);
  const body = useRef<HTMLDivElement>(null);
  const snapRef = useRef(snap);
  const cfg = useRef({ offsets, full });
  const reduced = useRef(false);
  const drag = useRef<{
    y0: number;
    yStart: number;
    s: { t: number; y: number }[];
    moved: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    snapRef.current = snap;
    cfg.current = { offsets, full };
  });
  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const go = useCallback(
    (target: number, velocity = 0) =>
      animate(
        y,
        target,
        reduced.current
          ? { duration: 0.01 }
          : { type: 'spring', stiffness: 420, damping: 40, velocity },
      ),
    [y],
  );

  // Move to the requested snap (or out of sight when closed).
  useEffect(() => {
    if (drag.current) return;
    const c = go(open ? offsets[snap] : full + 40);
    return () => c.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, snap, vp.h, vp.w, peek]);

  // Publish the visible height: CSS var for the control stack, store for the camera shift.
  useEffect(() => {
    const root = document.documentElement;
    const off = y.on('change', (v) => {
      const vis = Math.max(0, full - v);
      if (open) root.style.setProperty('--sheet-h', `${Math.round(vis)}px`);
    });
    return () => {
      off();
      if (open) root.style.setProperty('--sheet-h', '0px');
    };
  }, [y, full, open]);
  useEffect(() => {
    if (!open) {
      document.documentElement.style.setProperty('--sheet-h', '0px');
      useApp.setState({ sheetPx: 0 });
    } else useApp.setState({ sheetPx: vp.side ? 0 : heights[snap] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, snap, vp.h, vp.side, peek]);

  const begin = (cy: number) => {
    y.stop();
    drag.current = { y0: cy, yStart: y.get(), s: [{ t: performance.now(), y: cy }], moved: 0 };
    setDragging(true);
  };
  const move = (cy: number) => {
    const d = drag.current;
    if (!d) return;
    const { offsets: o } = cfg.current;
    let ny = d.yStart + (cy - d.y0);
    if (ny < 0)
      ny *= 0.25; // rubber band at the top
    else if (ny > o.peek) ny = o.peek + (ny - o.peek) * (snapRef.current === 'peek' ? 1 : 0.35);
    y.set(ny);
    d.moved = Math.max(d.moved, Math.abs(cy - d.y0));
    d.s.push({ t: performance.now(), y: cy });
    if (d.s.length > 6) d.s.shift();
  };
  const end = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d) return;
    const { offsets: o } = cfg.current;
    const a = d.s[0],
      b = d.s[d.s.length - 1];
    const v = b.t > a.t ? ((b.y - a.y) / (b.t - a.t)) * 1000 : 0;
    if (d.moved < 6) {
      // a tap on the handle cycles the snap
      const cur = snapRef.current;
      onSnap(cur === 'peek' ? 'half' : cur === 'half' ? 'peek' : 'half');
      return;
    }
    const pick = chooseSnap(y.get(), v, snapRef.current, o);
    if (pick === 'close') {
      go(cfg.current.full + 40, v);
      onClose();
    } else {
      go(o[pick], v);
      onSnap(pick);
    }
  };

  // Content: pulling down while scrolled to the top drags the sheet; otherwise the content scrolls.
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    let startY = 0,
      active = false;
    const ts = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
      active = false;
    };
    const tm = (e: TouchEvent) => {
      const cy = e.touches[0].clientY;
      if (!active && cy - startY > 6 && el.scrollTop <= 0) {
        active = true;
        begin(cy);
      }
      if (active) {
        e.preventDefault();
        move(cy);
      }
    };
    const te = () => {
      if (active) end();
      active = false;
    };
    el.addEventListener('touchstart', ts, { passive: true });
    el.addEventListener('touchmove', tm, { passive: false });
    el.addEventListener('touchend', te);
    el.addEventListener('touchcancel', te);
    return () => {
      el.removeEventListener('touchstart', ts);
      el.removeEventListener('touchmove', tm);
      el.removeEventListener('touchend', te);
      el.removeEventListener('touchcancel', te);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onHeaderDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button,a,input,select,[data-nodrag]')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    begin(e.clientY);
  };
  const padBottom = Math.max(0, offsets[snap]) + vp.sab + 12;

  return (
    <motion.section
      role="dialog"
      aria-label={label}
      aria-hidden={!open}
      data-sheet
      style={{
        y,
        height: full,
        visibility: open ? 'visible' : 'hidden',
        ...(vp.side ? { width: Math.min(vp.w >= 768 ? 380 : 300, vp.w * 0.4), left: 12 } : {}),
      }}
      className={`glass glass-solid fixed bottom-0 z-20 flex flex-col overflow-hidden rounded-t-3xl ${vp.side ? '' : 'inset-x-0'} ${dim ? 'shadow-2xl' : ''}`}
    >
      <div
        onPointerDown={onHeaderDown}
        onPointerMove={(e) => drag.current && move(e.clientY)}
        onPointerUp={end}
        onPointerCancel={end}
        className="shrink-0 cursor-grab select-none px-4 pt-2"
        style={{ touchAction: 'none' }}
      >
        <div
          className="mx-auto mb-1.5 h-1.5 w-10 rounded-full bg-slate-400/60"
          aria-hidden
          data-handle
        />
        {header}
      </div>
      <div
        ref={body}
        className="min-h-0 flex-1 overflow-y-auto px-4"
        style={{
          overscrollBehavior: 'contain',
          touchAction: 'pan-y',
          paddingBottom: padBottom,
          pointerEvents: dragging ? 'none' : 'auto',
        }}
      >
        {children}
      </div>
    </motion.section>
  );
}
