/**
 * Sinh QR trỏ về web cho thí sinh quét.
 *
 *   node scripts/make-qr.mjs [url]
 *
 * Chạy tay khi đổi tên miền. `qrcode` chỉ là devDependency — web chạy thật không tải
 * thư viện nào, chỉ dùng file ảnh tĩnh sinh sẵn.
 */
import { mkdir, writeFile } from "node:fs/promises";
import QRCode from "qrcode";

const url = process.argv[2] ?? "https://pccc26.vercel.app";

// Mức sửa lỗi H: quét được cả khi bản in bị bẩn, cong hoặc che một góc.
const common = { errorCorrectionLevel: "H", margin: 2 };

await mkdir("public", { recursive: true });

await writeFile(
  "public/qr-pccc26.svg",
  await QRCode.toString(url, { ...common, type: "svg" }),
);

// Bản PNG to để in standee mà không bị vỡ.
await writeFile(
  "public/qr-pccc26.png",
  await QRCode.toBuffer(url, { ...common, width: 1200 }),
);

console.log(`QR -> ${url}`);
console.log("  public/qr-pccc26.svg  (in, phóng bao nhiêu cũng nét)");
console.log("  public/qr-pccc26.png  (1200px)");
