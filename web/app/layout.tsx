import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VoiceBridge — Dịch giọng nói Real-time",
  description:
    "Dịch real-time tiếng Anh → tiếng Việt bằng giọng nói. Hỗ trợ voice cloning, Zoom, YouTube, Google Meet. Miễn phí.",
  keywords: [
    "voice translator",
    "real-time translation",
    "zoom translation",
    "youtube translation",
    "voice cloning",
    "english vietnamese",
  ],
  openGraph: {
    title: "VoiceBridge — Real-time Voice Translation",
    description:
      "Dịch giọng nói real-time cho Zoom, YouTube, Google Meet. Hỗ trợ clone giọng nói.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
