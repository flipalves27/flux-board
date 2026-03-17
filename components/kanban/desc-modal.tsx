"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { CardData } from "@/app/board/[id]/page";

const MIN_WIDTH = 380;
const MAX_WIDTH = 920;
const DEFAULT_WIDTH = 560;

interface DescModalProps {
  card: CardData;
  onClose: () => void;
  onSave: (cardId: string, desc: string) => void;
}

export function DescModal({ card, onClose, onSave }: DescModalProps) {
  const [desc, setDesc] = useState(card.desc || "");
  const [modalWidth, setModalWidth] = useState(DEFAULT_WIDTH);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const resizeStart = useRef({ x: 0, w: 0 });

  useEffect(() => {
    setDesc(card.desc || "");
  }, [card]);

  const handleSave = () => {
    onSave(card.id, desc.trim() || "Sem descrição.");
    onClose();
  };

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, posX: position.x, posY: position.y };
  }, [position]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(true);
    resizeStart.current = { x: e.clientX, w: modalWidth };
  }, [modalWidth]);

  useEffect(() => {
    if (!dragging && !resizing) return;
    const onMove = (e: MouseEvent) => {
      if (dragging) {
        setPosition({
          x: dragStart.current.posX + (e.clientX - dragStart.current.x),
          y: dragStart.current.posY + (e.clientY - dragStart.current.y),
        });
      }
      if (resizing) {
        const delta = e.clientX - resizeStart.current.x;
        setModalWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, resizeStart.current.w + delta)));
      }
    };
    const onUp = () => {
      setDragging(false);
      setResizing(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, resizing]);

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center backdrop-blur-sm p-4 modal-overlay-animate"
      role="dialog"
      aria-modal="true"
      aria-labelledby="desc-modal-title"
    >
      <div
        className="relative bg-[var(--flux-surface-card)] border border-[rgba(108,92,231,0.2)] rounded-2xl min-h-[280px] max-h-[90vh] overflow-hidden shadow-xl modal-content-animate flex flex-col"
        style={{
          width: modalWidth,
          transform: `translate(${position.x}px, ${position.y}px)`,
          transition: dragging || resizing ? "none" : "transform 0.2s ease, box-shadow 0.2s ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          onMouseDown={handleDragStart}
          className="h-1 rounded-t-2xl flex-shrink-0 cursor-move select-none"
          style={{
            background: "linear-gradient(90deg, var(--flux-primary), var(--flux-secondary))",
          }}
          aria-hidden
        />
        <div
          onMouseDown={handleDragStart}
          className="flex items-center justify-between gap-3 px-5 pt-4 pb-2 border-b border-[rgba(255,255,255,0.06)] cursor-move select-none bg-[var(--flux-surface-elevated)]/40"
        >
          <div id="desc-modal-title" className="font-display font-bold text-base text-[var(--flux-text)] flex items-center gap-2">
            Detalhes da descrição
            <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-[rgba(116,185,255,0.12)] text-[var(--flux-info)] border border-[rgba(116,185,255,0.35)]">
              {card.id}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full border border-[rgba(255,255,255,0.12)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] flex items-center justify-center text-lg hover:bg-[rgba(255,255,255,0.08)] hover:text-[var(--flux-text)] transition-colors flex-shrink-0 cursor-pointer"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1 scrollbar-kanban">
          <p className="text-xs font-semibold text-[var(--flux-text-muted)] uppercase tracking-wide mb-2 font-display">{card.title}</p>
          {card.links && card.links.length > 0 && (
            <div className="mb-4 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[var(--flux-surface-elevated)]/50 p-3">
              <span className="text-xs font-semibold text-[var(--flux-text-muted)] uppercase tracking-wider block mb-2 font-display">Links</span>
              <ul className="space-y-1.5">
                {card.links.map((link, i) => (
                  <li key={i}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[var(--flux-primary-light)] hover:text-[var(--flux-secondary)] hover:underline truncate block"
                    >
                      {link.label?.trim() || link.url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <label htmlFor="desc-textarea" className="block text-xs font-semibold text-[var(--flux-text-muted)] uppercase tracking-wide mb-2 font-display">
            Descrição
          </label>
          <textarea
            id="desc-textarea"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Sem descrição."
            className="w-full min-h-[140px] p-3 border border-[rgba(255,255,255,0.12)] rounded-xl font-sans text-sm text-[var(--flux-text)] bg-[var(--flux-surface-elevated)] placeholder-[var(--flux-text-muted)] resize-y outline-none focus:border-[var(--flux-primary)] focus:ring-2 focus:ring-[rgba(108,92,231,0.2)] whitespace-pre-wrap transition-all duration-200"
          />
        </div>
        <div className="flex gap-3 justify-end p-5 pt-3 border-t border-[rgba(255,255,255,0.06)] flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl font-semibold text-sm text-[var(--flux-text-muted)] bg-[var(--flux-surface-elevated)] hover:bg-[rgba(255,255,255,0.08)] transition-colors font-display"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 rounded-xl font-bold text-sm bg-[var(--flux-primary)] text-white hover:bg-[var(--flux-primary-light)] transition-all duration-200 font-display"
          >
            Salvar e Fechar
          </button>
        </div>
        <div
          onMouseDown={handleResizeStart}
          className="absolute top-0 right-0 w-2 h-full cursor-ew-resize resize-handle group"
          aria-label="Redimensionar largura"
        >
          <span className="absolute top-1/2 right-0 -translate-y-1/2 w-1 h-12 rounded-full bg-[rgba(255,255,255,0.2)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        </div>
      </div>
    </div>
  );
}
