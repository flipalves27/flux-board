"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, getApiHeaders } from "@/lib/api-client";
import { useCardModal } from "@/components/kanban/card-modal-context";
import { useAuth } from "@/context/auth-context";
import type { CommentData } from "@/lib/schemas";

const EMOJI_REACTIONS = ["👍", "❤️", "🎉", "🔥", "👀", "✅"];

function RelativeTime({ date }: { date: string }) {
  const d = new Date(date);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  let label = "agora";
  if (mins >= 1 && mins < 60) label = `${mins}min`;
  else if (hours >= 1 && hours < 24) label = `${hours}h`;
  else if (days >= 1) label = `${days}d`;

  return (
    <time dateTime={date} title={d.toLocaleString("pt-BR")} className="text-[10px] text-[var(--flux-text-muted)]">
      {label}
    </time>
  );
}

function CommentBubble({
  comment,
  isOwn,
  onDelete,
  onReact,
  onReply,
  isReply = false,
}: {
  comment: CommentData;
  isOwn: boolean;
  onDelete: (id: string) => void;
  onReact: (id: string, emoji: string) => void;
  onReply: (parentId: string) => void;
  isReply?: boolean;
}) {
  const [showEmoji, setShowEmoji] = useState(false);

  const reactionMap = new Map<string, number>();
  for (const r of comment.reactions) {
    reactionMap.set(r.emoji, (reactionMap.get(r.emoji) ?? 0) + 1);
  }

  return (
    <div className={`group flex items-start gap-2 ${isReply ? "ml-8" : ""}`}>
      <div className="shrink-0 w-7 h-7 rounded-full bg-[var(--flux-primary-alpha-15)] flex items-center justify-center text-xs font-bold text-[var(--flux-primary-light)] uppercase select-none">
        {comment.authorId.slice(0, 2)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-xs font-semibold text-[var(--flux-text)] truncate">{comment.authorId}</span>
          <RelativeTime date={comment.createdAt} />
          {comment.isAiGenerated && (
            <span className="text-[10px] rounded-full px-1.5 py-0.5 bg-[var(--flux-primary-alpha-08)] text-[var(--flux-primary-light)] border border-[var(--flux-primary-alpha-22)]">IA</span>
          )}
        </div>
        <div className="rounded-lg border border-[var(--flux-chrome-alpha-06)] bg-[var(--flux-surface-elevated)] px-3 py-2">
          <p className="text-sm text-[var(--flux-text)] whitespace-pre-wrap break-words">{comment.body}</p>
        </div>

        {/* Reactions */}
        {reactionMap.size > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {Array.from(reactionMap.entries()).map(([emoji, count]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onReact(comment.id, emoji)}
                className="flex items-center gap-0.5 rounded-full border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-chrome-alpha-04)] px-2 py-0.5 text-xs hover:border-[var(--flux-primary-alpha-35)] transition-all"
              >
                {emoji} <span className="text-[var(--flux-text-muted)] tabular-nums">{count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button type="button" onClick={() => onReply(comment.id)} className="text-[11px] text-[var(--flux-text-muted)] hover:text-[var(--flux-primary-light)] transition-colors">
            Responder
          </button>
          <div className="relative">
            <button type="button" onClick={() => setShowEmoji(!showEmoji)} className="text-[11px] text-[var(--flux-text-muted)] hover:text-[var(--flux-warning)] transition-colors">
              😊
            </button>
            {showEmoji && (
              <div className="absolute bottom-full left-0 mb-1 flex gap-1 rounded-xl border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-card)] p-1.5 shadow-lg z-10">
                {EMOJI_REACTIONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => { onReact(comment.id, e); setShowEmoji(false); }}
                    className="text-base hover:scale-125 transition-transform"
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
          {isOwn && (
            <button type="button" onClick={() => onDelete(comment.id)} className="text-[11px] text-[var(--flux-danger)] hover:underline transition-colors">
              Excluir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CardCommentsTab({ cardId }: { cardId: string }) {
  const { boardId, getHeaders } = useCardModal();
  const { user } = useAuth();

  const [comments, setComments] = useState<CommentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const baseUrl = `/api/boards/${encodeURIComponent(boardId)}/cards/${encodeURIComponent(cardId)}/comments`;

  const loadComments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(baseUrl, { headers: getApiHeaders(getHeaders()) });
      if (res.ok) {
        const data = await res.json() as { comments: CommentData[] };
        setComments(data.comments);
      }
    } finally {
      setLoading(false);
    }
  }, [baseUrl, getHeaders]);

  useEffect(() => { void loadComments(); }, [loadComments]);

  const handleSubmit = async () => {
    const text = body.trim();
    if (!text) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(baseUrl, {
        method: "POST",
        body: JSON.stringify({ body: text, parentCommentId: replyTo }),
        headers: getApiHeaders(getHeaders()),
      });
      if (res.ok) {
        const data = await res.json() as { comment: CommentData };
        setComments((prev) => [...prev, data.comment]);
        setBody("");
        setReplyTo(null);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = useCallback(async (commentId: string) => {
    const res = await apiFetch(`${baseUrl}?commentId=${encodeURIComponent(commentId)}`, {
      method: "DELETE",
      headers: getApiHeaders(getHeaders()),
    });
    if (res.ok) setComments((prev) => prev.filter((c) => c.id !== commentId));
  }, [baseUrl, getHeaders]);

  const handleReact = useCallback(async (commentId: string, emoji: string) => {
    const res = await apiFetch(baseUrl, {
      method: "PATCH",
      body: JSON.stringify({ commentId, emoji }),
      headers: getApiHeaders(getHeaders()),
    });
    if (res.ok) {
      const data = await res.json() as { comment: CommentData };
      setComments((prev) => prev.map((c) => c.id === commentId ? data.comment : c));
    }
  }, [baseUrl, getHeaders]);

  const topLevel = comments.filter((c) => !c.parentCommentId);
  const replies = comments.filter((c) => Boolean(c.parentCommentId));
  const replyingToComment = replyTo ? comments.find((c) => c.id === replyTo) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm text-[var(--flux-text)]">
          Comentários{comments.length > 0 ? ` (${comments.length})` : ""}
        </h3>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-[var(--flux-chrome-alpha-06)]" />
          ))}
        </div>
      ) : topLevel.length > 0 ? (
        <div className="space-y-4">
          {topLevel.map((c) => (
            <div key={c.id} className="space-y-2">
              <CommentBubble
                comment={c}
                isOwn={c.authorId === user?.id}
                onDelete={handleDelete}
                onReact={handleReact}
                onReply={(id) => { setReplyTo(id); setTimeout(() => textareaRef.current?.focus(), 50); }}
              />
              {replies.filter((r) => r.parentCommentId === c.id).map((r) => (
                <CommentBubble
                  key={r.id}
                  comment={r}
                  isOwn={r.authorId === user?.id}
                  onDelete={handleDelete}
                  onReact={handleReact}
                  onReply={(id) => { setReplyTo(id); setTimeout(() => textareaRef.current?.focus(), 50); }}
                  isReply
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--flux-chrome-alpha-10)] py-8 text-center text-sm text-[var(--flux-text-muted)]">
          Nenhum comentário ainda. Seja o primeiro!
        </div>
      )}

      {/* Compose */}
      <div className="rounded-xl border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-elevated)] p-3 space-y-2">
        {replyingToComment && (
          <div className="flex items-center justify-between rounded-lg bg-[var(--flux-chrome-alpha-04)] px-2 py-1">
            <span className="text-[11px] text-[var(--flux-text-muted)]">Respondendo: "{replyingToComment.body.slice(0, 60)}…"</span>
            <button type="button" onClick={() => setReplyTo(null)} className="text-[11px] text-[var(--flux-danger)] ml-2">✕</button>
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void handleSubmit(); }}
          placeholder="Escreva um comentário… (Ctrl+Enter para enviar)"
          className="w-full bg-transparent text-sm text-[var(--flux-text)] placeholder:text-[var(--flux-text-muted)] outline-none resize-none"
          rows={3}
          maxLength={2000}
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[var(--flux-text-muted)]">{body.length}/2000</span>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!body.trim() || submitting}
            className="rounded-full bg-[var(--flux-primary)] px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50 hover:bg-[var(--flux-primary-light)] transition-colors"
          >
            {submitting ? "…" : "Comentar"}
          </button>
        </div>
      </div>
    </div>
  );
}
