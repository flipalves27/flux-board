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
        className="relative bg-white rounded-2xl min-h-[280px] max-h-[90vh] overflow-hidden shadow-xl border border-[var(--g100)] modal-content-animate flex flex-col"
        style={{
          width: modalWidth,
          transform: `translate(${position.x}px, ${position.y}px)`,
          transition: dragging || resizing ? "none" : "transform 0.2s ease, box-shadow 0.2s ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra superior (drag + estilo) */}
        <div
          onMouseDown={handleDragStart}
          className="h-1 rounded-t-2xl flex-shrink-0 cursor-move select-none"
          style={{
            background: "linear-gradient(90deg, var(--teal), var(--teal-d))",
          }}
          aria-hidden
        />
        <div
          onMouseDown={handleDragStart}
          className="flex items-center justify-between gap-3 px-5 pt-4 pb-2 border-b border-[var(--g100)] cursor-move select-none bg-[var(--g50)]/40"
        >
          <div id="desc-modal-title" className="font-display font-extrabold text-base text-[var(--g800)] flex items-center gap-2">
            Detalhes da descrição
            <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-[var(--blue-bg)] text-[var(--blue)] border border-[var(--blue-b)]">
              {card.id}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full border border-[var(--g200)] bg-[var(--g50)] text-[var(--g500)] flex items-center justify-center text-lg hover:bg-[var(--g200)] hover:text-[var(--g800)] transition-colors flex-shrink-0 cursor-pointer"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1 scrollbar-kanban">
          <p className="text-xs font-semibold text-[var(--g600)] uppercase tracking-wide mb-2">{card.title}</p>
          {card.links && card.links.length > 0 && (
            <div className="mb-4 rounded-lg border border-[var(--g100)] bg-[var(--g50)]/50 p-3">
              <span className="text-xs font-semibold text-[var(--g500)] uppercase tracking-wider block mb-2">Links</span>
              <ul className="space-y-1.5">
                {card.links.map((link, i) => (
                  <li key={i}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[var(--teal)] hover:text-[var(--teal-d)] hover:underline truncate block"
                    >
                      {link.label?.trim() || link.url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <label htmlFor="desc-textarea" className="block text-xs font-semibold text-[var(--g600)] uppercase tracking-wide mb-2">
            Descrição
          </label>
          <textarea
            id="desc-textarea"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Sem descrição."
            className="w-full min-h-[140px] p-3 border border-[var(--g200)] rounded-xl font-sans text-sm text-[var(--g700)] bg-[var(--g50)] resize-y outline-none focus:border-[var(--teal)] focus:ring-2 focus:ring-[rgba(0,201,183,0.12)] whitespace-pre-wrap transition-all duration-200"
          />
        </div>
        <div className="flex gap-3 justify-end p-5 pt-3 border-t border-[var(--g100)] flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl font-semibold text-sm text-[var(--g600)] bg-[var(--g100)] hover:bg-[var(--g200)] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 rounded-xl font-bold text-sm bg-[var(--teal)] text-[var(--navy)] hover:bg-[var(--lime)] transition-all duration-200"
          >
            Salvar e Fechar
          </button>
        </div>
        {/* Resize handle — borda direita */}
        <div
          onMouseDown={handleResizeStart}
          className="absolute top-0 right-0 w-2 h-full cursor-ew-resize resize-handle group"
          aria-label="Redimensionar largura"
        >
          <span className="absolute top-1/2 right-0 -translate-y-1/2 w-1 h-12 rounded-full bg-[var(--g200)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        </div>
      </div>
    </div>
  );
}
