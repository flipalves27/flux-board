"use client";

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";

type MagnetCardProps = {
  children: ReactNode;
  /** Intensidade máxima do tilt em graus (default: 7). */
  intensity?: number;
  /** Escala do brilho interno (default: 0.55). 0 desliga o glow. */
  glow?: number;
  /** Classe extra aplicada ao wrapper. */
  className?: string;
  /** Desliga a interação (para reduced-motion, por exemplo). */
  disabled?: boolean;
};

/**
 * LandingMagnetCard — aplica tilt 3D sutil e glow reativo ao cursor.
 *
 * Interação inteligente:
 *   - Calcula offset normalizado (-1..1) da posição do mouse sobre o card
 *   - Aplica `rotateX/rotateY` proporcional em `transform` via style inline
 *   - Atualiza variáveis CSS `--mx`/`--my` para que um highlight radial
 *     siga o cursor dentro do card (via ::after).
 *   - Usa RAF e resetLerp ao sair, evitando jitter
 *   - Detecta `prefers-reduced-motion` e dispositivos touch
 *
 * Uso: embrulha qualquer filho (card estático existente) sem mudar a marcação
 * interna. Adiciona classe utilitária `landing-magnet-surface` para o glow.
 */
export function LandingMagnetCard({
  children,
  intensity = 7,
  glow = 0.55,
  className,
  disabled,
}: MagnetCardProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const currentRef = useRef({ rx: 0, ry: 0, mx: 50, my: 50, s: 0 });
  const targetRef = useRef({ rx: 0, ry: 0, mx: 50, my: 50, s: 0 });

  const apply = useCallback(() => {
    const node = wrapperRef.current;
    if (!node) return;
    const c = currentRef.current;
    const t = targetRef.current;
    c.rx += (t.rx - c.rx) * 0.18;
    c.ry += (t.ry - c.ry) * 0.18;
    c.mx += (t.mx - c.mx) * 0.25;
    c.my += (t.my - c.my) * 0.25;
    c.s += (t.s - c.s) * 0.22;
    node.style.transform = `perspective(900px) rotateX(${c.rx.toFixed(2)}deg) rotateY(${c.ry.toFixed(2)}deg)`;
    node.style.setProperty("--mx", `${c.mx.toFixed(1)}%`);
    node.style.setProperty("--my", `${c.my.toFixed(1)}%`);
    node.style.setProperty("--magnet-strength", c.s.toFixed(3));
    const diff =
      Math.abs(c.rx - t.rx) + Math.abs(c.ry - t.ry) + Math.abs(c.s - t.s);
    if (diff > 0.01) {
      rafRef.current = requestAnimationFrame(apply);
    } else {
      rafRef.current = null;
    }
  }, []);

  const schedule = useCallback(() => {
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(apply);
    }
  }, [apply]);

  useEffect(() => {
    if (disabled) return;
    const node = wrapperRef.current;
    if (!node) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const hoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (motionQuery.matches || !hoverQuery.matches) return;

    const handleMove = (e: PointerEvent) => {
      const rect = node.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width; // 0..1
      const ny = (e.clientY - rect.top) / rect.height;
      const cx = nx - 0.5;
      const cy = ny - 0.5;
      targetRef.current.rx = -cy * intensity;
      targetRef.current.ry = cx * intensity;
      targetRef.current.mx = nx * 100;
      targetRef.current.my = ny * 100;
      targetRef.current.s = glow;
      schedule();
    };
    const handleLeave = () => {
      targetRef.current.rx = 0;
      targetRef.current.ry = 0;
      targetRef.current.s = 0;
      schedule();
    };

    node.addEventListener("pointermove", handleMove);
    node.addEventListener("pointerleave", handleLeave);
    return () => {
      node.removeEventListener("pointermove", handleMove);
      node.removeEventListener("pointerleave", handleLeave);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [disabled, intensity, glow, schedule]);

  const baseStyle: CSSProperties = {
    transformStyle: "preserve-3d",
    transition: "transform 220ms ease-out",
    willChange: "transform",
  };

  // Se o filho é um único ReactElement, injeta a classe `landing-magnet-surface`
  // para habilitar o overlay de glow sem precisar mudar o markup do consumidor.
  if (isValidElement(children)) {
    const el = children as ReactElement<{ className?: string }>;
    const merged = [el.props.className, "landing-magnet-surface"].filter(Boolean).join(" ");
    return (
      <div
        ref={wrapperRef}
        className={className}
        style={baseStyle}
        data-magnet="true"
      >
        {cloneElement(el, { className: merged })}
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className={`landing-magnet-surface ${className ?? ""}`.trim()}
      style={baseStyle}
      data-magnet="true"
    >
      {children}
    </div>
  );
}
