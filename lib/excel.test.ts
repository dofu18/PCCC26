import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  buildLeaderboardWorkbook,
  buildQuestionTemplate,
  leaderboardFilename,
  normalizeImageUrl,
  parseQuestionWorkbook,
  QUESTION_HEADERS,
} from "./excel";
import type { LeaderboardRow } from "./types";

type Row = (string | number)[];

async function workbookFrom(rows: Row[], headers: readonly string[] = QUESTION_HEADERS) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Câu hỏi");
  ws.addRow([...headers]);
  rows.forEach((r) => ws.addRow(r));
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

const singleRow: Row = [
  "single",
  "Gọi PCCC số nào?",
  "",
  "113",
  "114",
  "115",
  "116",
  "B",
  20,
  1000,
  "114 là số của Cảnh sát PCCC.",
];

describe("normalizeImageUrl", () => {
  it("chuyển link Google Drive dạng chia sẻ sang link xem trực tiếp", () => {
    expect(normalizeImageUrl("https://drive.google.com/file/d/ABC123xyz/view?usp=sharing")).toBe(
      "https://drive.google.com/uc?export=view&id=ABC123xyz",
    );
  });

  it("giữ nguyên URL thường", () => {
    expect(normalizeImageUrl(" https://cdn.example.com/a.jpg ")).toBe(
      "https://cdn.example.com/a.jpg",
    );
  });
});

describe("parseQuestionWorkbook · hợp lệ", () => {
  it("đọc được cả bốn loại câu", async () => {
    const data = await workbookFrom([
      singleRow,
      ["multi", "Nên làm gì?", "", "Báo động", "Gọi 114", "Ngắt điện", "Mở cửa sổ", "A,B,C", "", "", ""],
      ["boolean", "Dùng thang máy khi cháy?", "", "", "", "", "", "FALSE", 15, "", "Dùng thang bộ."],
      ["text", "Bình bột ký hiệu?", "", "", "", "", "", "ABC|A B C", "", "", ""],
    ]);
    const { questions, errors } = await parseQuestionWorkbook(data);

    expect(errors).toEqual([]);
    expect(questions).toHaveLength(4);

    expect(questions[0]).toMatchObject({
      order_index: 1,
      type: "single",
      options: ["113", "114", "115", "116"],
      correct: [1],
      time_limit_s: 20,
      points: 1000,
    });
    expect(questions[1].correct).toEqual([0, 1, 2]);
    expect(questions[2]).toMatchObject({ type: "boolean", correct: [false], options: null });
    expect(questions[3]).toMatchObject({ type: "text", correct: ["ABC", "A B C"] });
  });

  it("chấp nhận correct dạng số và Đúng/Sai tiếng Việt", async () => {
    const data = await workbookFrom([
      ["single", "Số?", "", "113", "114", "", "", "2", "", "", ""],
      ["boolean", "Đúng không?", "", "", "", "", "", "Đúng", "", "", ""],
    ]);
    const { questions, errors } = await parseQuestionWorkbook(data);
    expect(errors).toEqual([]);
    expect(questions[0].correct).toEqual([1]);
    expect(questions[1].correct).toEqual([true]);
  });

  it("bỏ qua dòng trống ở giữa file", async () => {
    const data = await workbookFrom([singleRow, ["", "", "", "", "", "", "", "", "", "", ""], singleRow]);
    const { questions, errors } = await parseQuestionWorkbook(data);
    expect(errors).toEqual([]);
    expect(questions.map((q) => q.order_index)).toEqual([1, 2]);
  });

  it("không phụ thuộc thứ tự cột và đọc được cột option thêm", async () => {
    const data = await workbookFrom(
      [["Gọi PCCC số nào?", "single", "E", "113", "114", "115", "116", "119"]],
      ["question", "type", "correct", "option_a", "option_b", "option_c", "option_d", "option_e"],
    );
    const { questions, errors } = await parseQuestionWorkbook(data);
    expect(errors).toEqual([]);
    expect(questions[0].options).toHaveLength(5);
    expect(questions[0].correct).toEqual([4]);
  });

  it("chuyển link Drive trong cột image", async () => {
    const row = [...singleRow];
    row[2] = "https://drive.google.com/file/d/XYZ789/view";
    const { questions } = await parseQuestionWorkbook(await workbookFrom([row]));
    expect(questions[0].image_url).toBe("https://drive.google.com/uc?export=view&id=XYZ789");
  });
});

describe("parseQuestionWorkbook · báo lỗi", () => {
  it("báo lỗi theo số dòng và không nhận câu lỗi", async () => {
    const data = await workbookFrom([
      singleRow,
      ["choice", "Loại sai", "", "a", "b", "", "", "A", "", "", ""],
      ["single", "", "", "a", "b", "", "", "A", "", "", ""],
      ["single", "Correct trỏ sai", "", "a", "b", "", "", "D", "", "", ""],
      ["single", "Nhiều đáp án cho single", "", "a", "b", "", "", "A,B", "", "", ""],
      ["boolean", "Correct không hợp lệ", "", "", "", "", "", "có lẽ", "", "", ""],
      ["single", "Thời gian âm", "", "a", "b", "", "", "A", -5, "", ""],
    ]);
    const { questions, errors } = await parseQuestionWorkbook(data);

    expect(questions).toHaveLength(1);
    expect(errors.map((e) => e.row)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(errors[0].message).toContain("type");
    expect(errors[1].message).toContain("question");
    expect(errors[2].message).toContain("không trỏ tới đáp án nào");
    expect(errors[3].message).toContain("chỉ được có 1 đáp án đúng");
    expect(errors[4].message).toContain("TRUE/FALSE");
    expect(errors[5].message).toContain("time_limit");
  });

  it("thiếu cột bắt buộc thì báo một lỗi rõ ràng", async () => {
    const data = await workbookFrom([["single", "Thiếu correct"]], ["type", "question"]);
    const { questions, errors } = await parseQuestionWorkbook(data);
    expect(questions).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("correct");
  });

  it("câu single/multi thiếu đáp án bị chặn", async () => {
    const data = await workbookFrom([["single", "Chỉ có 1 đáp án", "", "a", "", "", "", "A", "", "", ""]]);
    const { errors } = await parseQuestionWorkbook(data);
    expect(errors[0].message).toContain("ít nhất 2 đáp án");
  });

  it("file không có câu nào thì báo lỗi thay vì im lặng", async () => {
    const { questions, errors } = await parseQuestionWorkbook(await workbookFrom([]));
    expect(questions).toEqual([]);
    expect(errors[0].message).toContain("Không tìm thấy câu hỏi");
  });
});

describe("buildQuestionTemplate", () => {
  it("tạo file mẫu đọc lại được không lỗi", async () => {
    const buffer = await buildQuestionTemplate();
    const { questions, errors } = await parseQuestionWorkbook(buffer);
    expect(errors).toEqual([]);
    expect(questions).toHaveLength(4);
    expect(questions.map((q) => q.type)).toEqual(["single", "multi", "boolean", "text"]);
  });
});

describe("buildLeaderboardWorkbook", () => {
  const rows: LeaderboardRow[] = [
    {
      participant_id: "p1",
      session_id: "s1",
      code: "HE181902",
      full_name: "Lê Thu Hà",
      display_name: "HE181902 - Lê Thu Hà",
      attempt_no: 1,
      started_at: "2026-08-31T07:20:00.000Z",
      finished_at: "2026-08-31T07:22:00.000Z",
      total_score: 8105,
      total_time_ms: 95000,
      answered_count: 10,
      correct_count: 9,
      rank: 1,
    },
    {
      participant_id: "p2",
      session_id: "s1",
      code: "HE180234",
      full_name: "Trần Minh Khôi",
      display_name: "HE180234 - Trần Minh Khôi",
      attempt_no: 2,
      started_at: "2026-08-31T07:20:30.000Z",
      finished_at: null,
      total_score: 7240,
      total_time_ms: 112000,
      answered_count: 8,
      correct_count: 8,
      rank: 2,
    },
  ];

  it("xuất đủ 3 sheet, giữ nguyên tiếng Việt và số liệu", async () => {
    const buffer = await buildLeaderboardWorkbook("Lượt 3 — Khoa Công nghệ", rows, [
      {
        code: "HE181902",
        full_name: "Lê Thu Hà",
        order_index: 1,
        question: "Gọi PCCC số nào?",
        given_text: "114",
        is_correct: true,
        time_ms: 4300,
        score: 950,
      },
    ]);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Bảng xếp hạng",
      "Thông tin lượt",
      "Chi tiết trả lời",
    ]);

    const board = wb.getWorksheet("Bảng xếp hạng")!;
    expect(board.getRow(1).getCell(1).value).toBe("Hạng");
    expect(board.getRow(2).getCell(3).value).toBe("Lê Thu Hà");
    expect(board.getRow(2).getCell(5).value).toBe(8105);
    expect(board.getRow(3).getCell(9).value).toBe("chưa nộp");

    const detail = wb.getWorksheet("Chi tiết trả lời")!;
    expect(detail.getRow(2).getCell(6).value).toBe("Đúng");
  });
});

describe("leaderboardFilename", () => {
  it("bỏ dấu và ký tự đặc biệt", () => {
    expect(leaderboardFilename("Lượt 3 — Khoa Công nghệ")).toMatch(
      /^bang-xep-hang-luot-3-khoa-cong-nghe-\d{4}-\d{2}-\d{2}\.xlsx$/,
    );
  });

  it("tên trống vẫn ra tên file dùng được", () => {
    expect(leaderboardFilename("!!!")).toMatch(/^bang-xep-hang-luot-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});
