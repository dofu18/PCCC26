"use client";

import useSWR from "swr";
import { formatScore } from "@/lib/format";

export type BoardRow = {
  participant_id: string;
  rank: number;
  code: string;
  display_name: string;
  full_name: string;
  total_score: number;
  total_time_ms: number;
  correct_count: number;
  answered_count: number;
  finished_at: string | null;
};

type Payload = {
  session: { id: string; name: string; status: string } | null;
  rows: BoardRow[];
};

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
  refreshMs = 2000,
}: {
  sessionId?: string;
  limit?: number;
  highlightParticipantId?: string;
  initialRows?: BoardRow[];
  refreshMs?: number;
}) {
  const query = new URLSearchParams({ limit: String(limit) });
  if (sessionId) query.set("sessionId", sessionId);

  const { data, error } = useSWR<Payload>(`/api/leaderboard?${query}`, fetcher, {
    refreshInterval: refreshMs,
    fallbackData: initialRows ? { session: null, rows: initialRows } : undefined,
    keepPreviousData: true,
  });

  const rows = data?.rows ?? [];

  if (error && rows.length === 0) {
    return <p className="notice">Chưa tải được bảng xếp hạng. Đang thử lại…</p>;
  }

  if (rows.length === 0) {
    return <p className="notice">Chưa có ai nộp bài.</p>;
  }

  return (
    <div className="board">
      {rows.map((row) => {
        const classes = ["row"];
        if (row.rank === 1) classes.push("row--lead");
        if (row.participant_id === highlightParticipantId) classes.push("row--self");
        return (
          <div className={classes.join(" ")} key={row.participant_id}>
            <span className="row__rank num">{row.rank}</span>
            <span className="row__who">
              <span className="row__code num">{row.code}</span>
              <br />
              <span className="row__name">{row.full_name}</span>
            </span>
            <span className="row__pts num">{formatScore(row.total_score)}</span>
          </div>
        );
      })}
    </div>
  );
}
