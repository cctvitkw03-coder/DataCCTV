import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "งาน IT · Photo Manager",
  description: "จัดการชุดรูปจาก Telegram ไป Google Drive",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
