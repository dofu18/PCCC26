"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import useSWR from "swr";
import { formatDuration } from "@/lib/format";

export type BoardRow = {
  participant_id: string;
  rank: number;
  code: string;
  display_name: string;
  full_name: string;
  total_time_ms: number;
  correct_count: number;
  answered_count: number;
  finished_at: string | null;
};

type Payload = {
  session: { id: string; name: string; status: string; total_questions?: number } | null;
  rows: BoardRow[];
  /** sĩ số thật của lượt — `rows` bị cắt theo limit nên không dùng rows.length được */
  participant_count?: number;
};

/**
 * Key SWR dùng chung. Hai component cùng key thì SWR chia sẻ một lần fetch,
 * nên đếm sĩ số ở nav không tạo thêm request nào.
 */
function boardKey(sessionId: string | undefined, limit: number): string {
  const query = new URLSearchParams({ limit: String(limit) });
  if (sessionId) query.set("sessionId", sessionId);
  return `/api/leaderboard?${query}`;
}

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Không tải được bảng xếp hạng.");
  return response.json();
};

/**
 * Bảng xếp hạng tự cập nhật bằng cách hỏi lại server mỗi 2 giây.
 * Với 10–15 thí sinh, cách này cho cảm giác realtime mà không cần websocket —
 * ít thứ có thể hỏng giữa lúc đang chạy sự kiện.
 */
export function LiveLeaderboard({
  sessionId,
  limit = 20,
  highlightParticipantId,
  initialRows,
  totalQuestions,
  refreshMs = 2000,
}: {
  sessionId?: string;
  limit?: number;
  highlightParticipantId?: string;
  initialRows?: BoardRow[];
  totalQuestions?: number;
  refreshMs?: number;
}) {
  const { data, error } = useSWR<Payload>(boardKey(sessionId, limit), fetcher, {
    refreshInterval: refreshMs,
    fallbackData: initialRows ? { session: null, rows: initialRows } : undefined,
    keepPreviousData: true,
  });

  const rows = data?.rows ?? [];
  const reduce = useReducedMotion();

  // Ai vừa trả lời đúng thêm một câu thì cho số nảy lên. So sánh qua một "chữ ký"
  // id:số-câu-đúng để effect chỉ chạy khi bảng thật sự đổi. Class được gắn trực tiếp vào
  // DOM (không qua state) nên không kéo thêm một vòng render mỗi 2 giây.
  const signature = rows.map((row) => `${row.participant_id}:${row.correct_count}`).join("|");
  const prevScores = useRef(new Map<string, number>());
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const board = boardRef.current;
    for (const part of signature ? signature.split("|") : []) {
      const [id, raw] = part.split(":");
      const correct = Number(raw);
      const before = prevScores.current.get(id);
      const rose = before !== undefined && correct > before;
      prevScores.current.set(id, correct);
      if (!rose || !board) continue;
      const node = board.querySelector<HTMLElement>(`[data-pts="${id}"]`);
      if (!node) continue;
      node.classList.remove("row__pts--bump");
      void node.offsetWidth; // buộc reflow để animation chạy lại từ đầu
      node.classList.add("row__pts--bump");
    }
  }, [signature]);

  if (error && rows.length === 0) {
    return <p className="notice">Chưa tải được bảng xếp hạng. Đang thử lại…</p>;
  }

  if (rows.length === 0) {
    return <p className="notice">Chưa có ai nộp bài.</p>;
  }

  return (
    <div className="board" ref={boardRef}>
      <AnimatePresence initial={false}>
        {rows.map((row, index) => {
          const classes = ["row"];
          if (row.rank === 1) classes.push("row--lead", "row--top1");
          else if (row.rank === 2) classes.push("row--top2");
          else if (row.rank === 3) classes.push("row--top3");
          if (row.participant_id === highlightParticipantId) classes.push("row--self");
          return (
            <motion.div
              className={classes.join(" ")}
              key={row.participant_id}
              layout={reduce ? false : "position"}
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -8 }}
              transition={{
                layout: { type: "spring", stiffness: 520, damping: 38, mass: 0.6 },
                opacity: { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
                y: { duration: 0.32, ease: [0.16, 1, 0.3, 1], delay: index * 0.035 },
              }}
            >
              <span className="row__rank num">{row.rank}</span>
              <span className="row__who">
                <span className="row__person">{row.full_name}</span>
                <br />
                <span className="row__code num">{row.code}</span>
              </span>
              <span className="row__pts num" data-pts={row.participant_id}>
                {row.correct_count}/{data?.session?.total_questions ?? totalQuestions ?? "—"}
                <span className="row__unit"> câu</span>
                <br />
                <span className="row__time num">{formatDuration(row.total_time_ms)}</span>
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/**
 * Sĩ số thí sinh, tự cập nhật. Dùng chung key SWR với `LiveLeaderboard` nên không
 * tốn thêm request — `limit` phải truyền đúng bằng cái mà bảng bên dưới đang dùng.
 */
export function LiveParticipantCount({
  sessionId,
  limit = 20,
  initial = 0,
  refreshMs = 2000,
}: {
  sessionId?: string;
  limit?: number;
  initial?: number;
  refreshMs?: number;
}) {
  const { data } = useSWR<Payload>(boardKey(sessionId, limit), fetcher, {
    refreshInterval: refreshMs,
    keepPreviousData: true,
  });
  return <>{data?.participant_count ?? initial}</>;
}
