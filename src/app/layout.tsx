import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import { RegisterSW } from '@/components/RegisterSW';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nust-world.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: 'NUST World — Interactive 3D Campus Map of NUST Islamabad',
  description:
    'Never get lost at NUST again. Explore the NUST H-12 campus in 3D, find any building in seconds, and get walking directions between departments, hostels, cafes and gates.',
  keywords: [
    'NUST',
    'NUST map',
    'NUST campus map',
    'H-12 Islamabad',
    'SEECS',
    'NUST hostels',
    '3D campus map',
  ],
  applicationName: 'NUST World',
  manifest: '/manifest.webmanifest',
  icons: { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }], apple: '/icon-512.png' },
  openGraph: {
    title: 'NUST World — Never get lost at NUST again',
    description:
      'A game-style 3D map of NUST. Find any building, get walking directions, share your route.',
    type: 'website',
    siteName: 'NUST World',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NUST World',
    description: 'Never get lost at NUST again.',
  },
  appleWebApp: { capable: true, title: 'NUST World', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#070d1c',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'NUST World',
    description: 'Interactive 3D campus map of NUST, Islamabad.',
    applicationCategory: 'NavigationApplication',
    operatingSystem: 'Any',
    url: SITE,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    about: {
      '@type': 'CollegeOrUniversity',
      name: 'National University of Sciences and Technology (NUST)',
      address: { '@type': 'PostalAddress', addressLocality: 'Islamabad', addressCountry: 'PK' },
    },
  };
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
        <RegisterSW />
        <Analytics />
      </body>
    </html>
  );
}
