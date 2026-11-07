import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Red Party",
  description: "Closed schedule for the poker group",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="dark" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
