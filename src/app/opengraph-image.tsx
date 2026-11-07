import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const alt = 'NUST World: never get lost at NUST again';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Link-preview card shown when the site is shared. Background = a real render of the clean map (public/og-map.png). */
export default function Image() {
  const map = `data:image/png;base64,${readFileSync(join(process.cwd(), 'public', 'og-map.png')).toString('base64')}`;
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        background: '#070d1c',
        color: 'white',
        fontFamily: 'sans-serif',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={map}
        width={1200}
        height={630}
        alt=""
        style={{ position: 'absolute', left: 0, top: 0 }}
      />
      <div
        style={{
          position: 'absolute',
          left: 48,
          top: 48,
          display: 'flex',
          flexDirection: 'column',
          padding: '24px 36px',
          borderRadius: 28,
          background: 'rgba(7,13,28,0.85)',
        }}
      >
        <div style={{ display: 'flex', fontSize: 84, fontWeight: 900, letterSpacing: -3 }}>
          NUST <span style={{ color: '#ffd04d', marginLeft: 20 }}>World</span>
        </div>
        <div style={{ fontSize: 34, marginTop: 8, color: '#c7d6f2' }}>
          Never get lost at NUST again.
        </div>
      </div>
    </div>,
    size,
  );
}
