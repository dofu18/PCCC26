import ExcelJS from "exceljs";
import type { LeaderboardRow, QuestionType } from "./types";

export const QUESTION_HEADERS = [
  "type",
  "question",
  "image",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "correct",
  "explanation",
] as const;

export type ParsedQuestion = {
  order_index: number;
  type: QuestionType;
  content: string;
  image_url: string | null;
  options: string[] | null;
  correct: (number | boolean | string)[];
  explanation: string | null;
};

export type RowError = { row: number; message: string };

export type ParseResult = {
  questions: ParsedQuestion[];
  errors: RowError[];
};

const LETTERS = "ABCDEFGHIJ";

/**
 * Link Google Drive dạng chia sẻ không hiển thị được trong thẻ <img>.
 * Chuyển sang dạng xem trực tiếp nếu nhận ra được id.
 */
export function normalizeImageUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return "";
  const drive =
    url.match(/drive\.google\.com\/file\/d\/([\w-]+)/) ??
    url.match(/drive\.google\.com\/open\?id=([\w-]+)/);
  if (drive) return `https://drive.google.com/uc?export=view&id=${drive[1]}`;
  return url;
}

function cellText(row: ExcelJS.Row, index: number): string {
  if (!Number.isInteger(index) || index < 1) return ""; // cột không tồn tại
  const value = row.getCell(index).value;
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim();
    }
    if ("result" in value) return String(value.result ?? "").trim();
    if ("hyperlink" in value && typeof value.hyperlink === "string") return value.hyperlink.trim();
  }
  return String(value).trim();
}

function parseBooleanAnswer(value: string): boolean | null {
  const v = value.toLowerCase();
  if (["true", "t", "1", "yes", "y", "đúng", "dung", "đ"].includes(v)) return true;
  if (["false", "f", "0", "no", "n", "sai", "s"].includes(v)) return false;
  return null;
}

/** Đọc file .xlsx BTC upload thành danh sách câu hỏi + danh sách lỗi theo dòng. */
export async function parseQuestionWorkbook(data: ArrayBuffer): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const ws = wb.worksheets[0];
  if (!ws) return { questions: [], errors: [{ row: 0, message: "File không có sheet nào." }] };

  // Đọc header để biết cột nào ở đâu — không phụ thuộc thứ tự cột.
  const headerRow = ws.getRow(1);
  const columns = new Map<string, number>();
  headerRow.eachCell((cell, col) => {
    const key = String(cell.value ?? "").trim().toLowerCase();
    if (key) columns.set(key, col);
  });

  const missing = ["type", "question", "correct"].filter((h) => !columns.has(h));
  if (missing.length) {
    return {
      questions: [],
      errors: [
        {
          row: 1,
          message: `Thiếu cột bắt buộc: ${missing.join(", ")}. Tải file mẫu ở trang quản trị để đúng định dạng.`,
        },
      ],
    };
  }

  const optionColumns = [...columns.entries()]
    .filter(([key]) => key.startsWith("option_"))
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, col]) => col);

  const questions: ParsedQuestion[] = [];
  const errors: RowError[] = [];
  let order = 0;

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const rowErrors: string[] = [];

    const typeRaw = cellText(row, columns.get("type")!).toLowerCase();
    const content = cellText(row, columns.get("question")!);
    const correctRaw = cellText(row, columns.get("correct")!);

    // dòng trống hoàn toàn → bỏ qua, không tính là lỗi
    if (!typeRaw && !content && !correctRaw) continue;

    if (!["single", "multi", "boolean", "text"].includes(typeRaw)) {
      rowErrors.push(`type phải là single / multi / boolean / text, đang là “${typeRaw || "trống"}”`);
    }
    if (!content) rowErrors.push("question đang để trống");

    const type = typeRaw as QuestionType;
    const options = optionColumns.map((col) => cellText(row, col)).filter((v) => v.length > 0);

    let correct: (number | boolean | string)[] = [];

    if (type === "single" || type === "multi") {
      if (options.length < 2) {
        rowErrors.push(`câu ${type} cần ít nhất 2 đáp án trong các cột option_*`);
      }
      const tokens = correctRaw
        .split(/[,;+]/)
        .map((t) => t.trim())
        .filter(Boolean);
      if (tokens.length === 0) rowErrors.push("correct đang để trống");
      if (type === "single" && tokens.length > 1) {
        rowErrors.push("câu single chỉ được có 1 đáp án đúng");
      }
      const indexes: number[] = [];
      for (const token of tokens) {
        const upper = token.toUpperCase();
        let index = -1;
        if (/^[A-J]$/.test(upper)) index = LETTERS.indexOf(upper);
        else if (/^\d+$/.test(upper)) index = Number(upper) - 1; // 1 = đáp án đầu
        if (index < 0 || index >= options.length) {
          rowErrors.push(`correct “${token}” không trỏ tới đáp án nào (chỉ có ${options.length} đáp án)`);
        } else if (indexes.includes(index)) {
          rowErrors.push(`correct “${token}” bị lặp`);
        } else {
          indexes.push(index);
        }
      }
      correct = indexes;
    } else if (type === "boolean") {
      const value = parseBooleanAnswer(correctRaw);
      if (value === null) {
        rowErrors.push(`câu boolean cần correct là TRUE/FALSE (hoặc Đúng/Sai), đang là “${correctRaw}”`);
      } else {
        correct = [value];
      }
    } else if (type === "text") {
      const variants = correctRaw
        .split("|")
        .map((t) => t.trim())
        .filter(Boolean);
      if (variants.length === 0) rowErrors.push("correct đang để trống");
      correct = variants;
    }

    if (rowErrors.length) {
      errors.push({ row: r, message: rowErrors.join(" · ") });
      continue;
    }

    const imageRaw = cellText(row, columns.get("image") ?? -1);
    const explanation = cellText(row, columns.get("explanation") ?? -1);

    order += 1;
    questions.push({
      order_index: order,
      type,
      content,
      image_url: imageRaw ? normalizeImageUrl(imageRaw) : null,
      options: type === "single" || type === "multi" ? options : null,
      correct,
      explanation: explanation || null,
    });
  }

  if (questions.length === 0 && errors.length === 0) {
    errors.push({ row: 0, message: "Không tìm thấy câu hỏi nào trong file." });
  }

  return { questions, errors };
}

/** File mẫu cho BTC điền. */
export async function buildQuestionTemplate(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Câu hỏi");
  ws.addRow([...QUESTION_HEADERS]);
  ws.getRow(1).font = { bold: true };
  ws.addRow([
    "single",
    "Số điện thoại gọi lực lượng Cảnh sát phòng cháy chữa cháy là số nào?",
    "",
    "113",
    "114",
    "115",
    "116",
    "B",
    "114 là số của Cảnh sát phòng cháy chữa cháy và cứu nạn cứu hộ.",
  ]);
  ws.addRow([
    "multi",
    "Khi phát hiện cháy, những việc nào nên làm ngay?",
    "",
    "Báo động cho những người xung quanh",
    "Gọi 114",
    "Ngắt nguồn điện khu vực đang cháy",
    "Mở toàn bộ cửa sổ cho khói bay ra",
    "A,B,C",
    "Mở cửa sổ đưa thêm không khí vào làm lửa bùng lên mạnh hơn.",
  ]);
  ws.addRow([
    "boolean",
    "Khi có cháy ở nhà cao tầng, nên dùng thang máy để thoát ra ngoài cho nhanh.",
    "",
    "",
    "",
    "",
    "",
    "FALSE",
    "Thang máy có thể mất điện và kẹt lại; hãy dùng thang bộ.",
  ]);
  ws.addRow([
    "text",
    "Bình chữa cháy dạng bột dùng cho chất rắn, lỏng và khí ký hiệu bằng ba chữ cái nào?",
    "https://example.com/anh-binh-chua-chay.jpg",
    "",
    "",
    "",
    "",
    "ABC",
    "Bột ABC chữa được cả ba nhóm chất.",
  ]);

  const guide = wb.addWorksheet("Hướng dẫn");
  guide.columns = [{ width: 16 }, { width: 96 }];
  guide.addRow(["Cột", "Cách điền"]);
  guide.getRow(1).font = { bold: true };
  [
    ["type", "single = 1 đáp án · multi = nhiều đáp án · boolean = Đúng/Sai · text = điền chữ"],
    ["question", "Nội dung câu hỏi. Bắt buộc."],
    ["image", "URL ảnh công khai. Để trống nếu câu không có ảnh. Link Google Drive dạng chia sẻ sẽ được tự chuyển."],
    ["option_a…d", "Các đáp án cho single/multi. Bỏ trống với boolean và text. Thêm cột option_e, option_f… nếu cần."],
    ["correct", "single: B · multi: A,C · boolean: TRUE hoặc FALSE · text: đáp án (nhiều biến thể cách nhau bởi dấu |)"],
    ["explanation", "Giải thích hiện ra sau khi thí sinh trả lời. Nên có."],
  ].forEach((r) => guide.addRow(r));
  guide.addRow([]);
  guide.addRow(["Lưu ý", "Đáp án dạng text được so khớp bỏ qua hoa/thường, dấu câu và dấu tiếng Việt."]);

  ws.columns = [
    { width: 10 },
    { width: 60 },
    { width: 28 },
    { width: 24 },
    { width: 24 },
    { width: 24 },
    { width: 24 },
    { width: 12 },
    { width: 60 },
  ];

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

export type AnswerDetail = {
  code: string;
  full_name: string;
  order_index: number;
  question: string;
  given_text: string;
  is_correct: boolean;
  time_ms: number;
};

function formatDuration(ms: number): string {
  const total = Math.round(ms / 100) / 10;
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  if (minutes === 0) return `${seconds.toFixed(1)} giây`;
  return `${minutes} phút ${seconds.toFixed(1)} giây`;
}

/** Xuất bảng xếp hạng + chi tiết từng câu để đối soát. */
export async function buildLeaderboardWorkbook(
  sessionName: string,
  rows: LeaderboardRow[],
  details: AnswerDetail[],
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PCCC26";
  wb.created = new Date();

  const ws = wb.addWorksheet("Bảng xếp hạng");
  ws.columns = [
    { header: "Hạng", key: "rank", width: 8 },
    { header: "Mã số", key: "code", width: 14 },
    { header: "Họ tên", key: "name", width: 26 },
    { header: "Tên hiển thị", key: "display", width: 40 },
    { header: "Số câu đúng", key: "correct", width: 14 },
    { header: "Số câu đã trả lời", key: "answered", width: 18 },
    { header: "Tổng thời gian", key: "time", width: 18 },
    { header: "Thời điểm nộp", key: "finished", width: 22 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  rows.forEach((r) => {
    ws.addRow({
      rank: r.rank,
      code: r.code,
      name: r.full_name,
      display: r.display_name,
      correct: r.correct_count,
      answered: r.answered_count,
      time: formatDuration(r.total_time_ms),
      finished: r.finished_at ? new Date(r.finished_at).toLocaleString("vi-VN") : "chưa nộp",
    });
  });

  const info = wb.addWorksheet("Thông tin lượt");
  info.columns = [{ width: 22 }, { width: 60 }];
  info.addRow(["Tên lượt", sessionName]);
  info.addRow(["Xuất lúc", new Date().toLocaleString("vi-VN")]);
  info.addRow(["Số thí sinh", rows.length]);
  info.addRow([
    "Ghi chú",
    "Xếp theo số câu đúng. Bằng số câu đúng thì ai tổng thời gian ít hơn xếp trên. Mỗi mã số chỉ tính lượt làm tốt nhất.",
  ]);

  const ds = wb.addWorksheet("Chi tiết trả lời");
  ds.columns = [
    { header: "Mã số", key: "code", width: 14 },
    { header: "Họ tên", key: "name", width: 26 },
    { header: "Câu số", key: "order", width: 9 },
    { header: "Câu hỏi", key: "question", width: 60 },
    { header: "Đã chọn", key: "given", width: 40 },
    { header: "Kết quả", key: "result", width: 12 },
    { header: "Thời gian", key: "time", width: 14 },
  ];
  ds.getRow(1).font = { bold: true };
  ds.views = [{ state: "frozen", ySplit: 1 }];
  details.forEach((d) => {
    ds.addRow({
      code: d.code,
      name: d.full_name,
      order: d.order_index,
      question: d.question,
      given: d.given_text,
      result: d.is_correct ? "Đúng" : "Sai",
      time: formatDuration(d.time_ms),
    });
  });

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

/** Tên file gợi ý khi tải về. */
export function leaderboardFilename(sessionName: string): string {
  const slug = sessionName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  const stamp = new Date().toISOString().slice(0, 10);
  return `bang-xep-hang-${slug || "luot"}-${stamp}.xlsx`;
}
