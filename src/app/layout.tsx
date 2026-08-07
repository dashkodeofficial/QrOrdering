import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/components/providers/query-provider";
import { Toaster } from "@/components/ui/sonner";
import { getLayoutSettingsCached } from "@/lib/data/settings";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getLayoutSettingsCached();
  const faviconUrl = settings.favicon_url ?? "/favicon.svg";
  return {
    title: {
      default: "Tofu Dining",
      template: "%s · Tofu Dining",
    },
    description: "Scan, browse, order — a modern restaurant QR dining system.",
    icons: {
      icon: faviconUrl,
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = await getLayoutSettingsCached();
  const primaryColor = settings.primary_color;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <style
          dangerouslySetInnerHTML={{
            __html: `:root{--primary:${primaryColor};--app-primary:${primaryColor};--ring:${primaryColor};--sidebar-primary:${primaryColor};--sidebar-ring:${primaryColor};--chart-1:${primaryColor};--destructive:${primaryColor};--danger:${primaryColor};}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <QueryProvider>
          {/* The root layout is the static shell (cached settings, fonts,
              providers, toaster). Route-specific content (dashboard layout
              reads cookies/headers; customer layout streams the access gate)
              is dynamic, so wrap it in <Suspense> to let the shell paint
              instantly while per-route data streams in. */}
          <Suspense fallback={null}>{children}</Suspense>
          <Toaster richColors position="top-center" />
        </QueryProvider>
      </body>
    </html>
  );
}
