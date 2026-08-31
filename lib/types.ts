export type QuestionType = "single" | "multi" | "boolean" | "text";

/** Câu hỏi như lưu trong DB (có đáp án đúng — KHÔNG bao giờ gửi xuống client). */
export type Question = {
  id: string;
  set_id: string;
  order_index: number;
  type: QuestionType;
  content: string;
  image_url: string | null;
  options: string[] | null;
  /** single: [index] · multi: [i,j] · boolean: [true|false] · text: ["đáp án", "biến thể"] */
  correct: (number | boolean | string)[];
  time_limit_s: number | null;
  points: number | null;
  explanation: string | null;
};

/** Câu hỏi đã lược bỏ đáp án, an toàn để gửi xuống client. */
export type PublicQuestion = {
  id: string;
  type: QuestionType;
  content: string;
  image_url: string | null;
  /** đã trộn theo thứ tự riêng của thí sinh */
  options: string[] | null;
  time_limit_s: number;
  index: number;
  total: number;
};

export type Settings = {
  default_time_limit_s: number;
  default_points: number;
  speed_bonus: boolean;
  show_feedback: boolean;
  multi_all_or_nothing: boolean;
};

export type SessionRow = {
  id: string;
  name: string;
  question_set_id: string;
  status: "active" | "finished";
  settings: Settings;
  started_at: string;
  ended_at: string | null;
};

/** Một phần tử trong participants.question_order */
export type OrderedQuestion = {
  /** id câu hỏi */
  qid: string;
  /** ánh xạ vị trí hiển thị → vị trí gốc trong questions.options */
  options: number[];
};

export type LeaderboardRow = {
  participant_id: string;
  session_id: string;
  code: string;
  full_name: string;
  display_name: string;
  attempt_no: number;
  started_at: string;
  finished_at: string | null;
  total_score: number;
  total_time_ms: number;
  answered_count: number;
  correct_count: number;
  rank: number;
};

/** Đáp án thí sinh gửi lên, đã ở hệ toạ độ hiển thị (chưa map về gốc). */
export type GivenAnswer =
  | { kind: "choice"; picked: number[] }
  | { kind: "boolean"; value: boolean }
  | { kind: "text"; value: string }
  | { kind: "timeout" };
