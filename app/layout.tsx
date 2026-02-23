/**
 * =============================================================================
 * APP/LAYOUT.TSX — Root Layout
 * =============================================================================
 *
 * The root layout wraps every page. It:
 * - Sets up the HTML metadata (title, description, viewport)
 * - Loads the Inter font from Google Fonts
 * - Imports global CSS
 * - Provides the <html> and <body> structure
 *
 * WHY NOT USE CONTEXT PROVIDERS HERE?
 * Zustand doesn't need a Provider (unlike Redux). This keeps
 * the layout clean and simple. The store is just imported directly.
 * =============================================================================
 */

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AI House Designer — Design Your Dream Home in 3D',
  description:
    'Describe your dream family home and watch AI build it in 3D. Walk through every room, adjust walls with sliders, analyze thermal efficiency, and export professional architect plans.',
  keywords: ['house design', 'AI architect', '3D house', 'building plans', 'home design', 'parametric design'],
  openGraph: {
    title: 'AI House Designer',
    description: 'Design your dream home with AI. 3D walk-through, real materials, budget tracking, and professional building plans.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
