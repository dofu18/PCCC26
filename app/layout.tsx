import type { Metadata, Viewport } from "next";
import { Anton, Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";

const anton = Anton({
  weight: "400",
  subsets: ["latin", "latin-ext", "vietnamese"],
  variable: "--font-anton",
  display: "swap",
});

const beVietnamPro = Be_Vietnam_Pro({
  weight: ["400", "600", "800"],
  subsets: ["latin", "latin-ext", "vietnamese"],
  variable: "--font-bvp",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PCCC26 · Đố vui phòng cháy chữa cháy",
  description:
    "Trả lời bộ câu hỏi phòng cháy chữa cháy và theo dõi bảng xếp hạng của sự kiện PCCC26.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${anton.variable} ${beVietnamPro.variable}`}>
      <body>{children}</body>
    </html>
  );
}
