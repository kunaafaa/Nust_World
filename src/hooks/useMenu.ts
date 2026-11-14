'use client';
import { useEffect, useState } from 'react';
import { cachedMenu, loadMenu, type Menu } from '@/lib/menu';

export type MenuState =
  | { status: 'none' } // this place has no menu id
  | { status: 'loading' }
  | { status: 'ready'; menu: Menu }
  | { status: 'missing' }; // id set but no data

/** Loads data/menus/<menuId>.json on demand (dynamic import). Cached after the first load. */
export function useMenu(menuId?: string): MenuState {
  const [loaded, setLoaded] = useState<{ id: string; menu: Menu | null } | null>(null);
  const cached = menuId ? cachedMenu(menuId) : undefined;

  useEffect(() => {
    if (!menuId || cachedMenu(menuId) !== undefined) return;
    let live = true;
    loadMenu(menuId).then((menu) => live && setLoaded({ id: menuId, menu }));
    return () => {
      live = false;
    };
  }, [menuId]);

  if (!menuId) return { status: 'none' };
  const menu = cached !== undefined ? cached : loaded?.id === menuId ? loaded.menu : undefined;
  if (menu === undefined) return { status: 'loading' };
  return menu ? { status: 'ready', menu } : { status: 'missing' };
}
