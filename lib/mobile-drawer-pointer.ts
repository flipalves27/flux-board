import { useCallback, useRef } from "react";

const EDGE_PX = 28;
const OPEN_DELTA = 72;
const CLOSE_DELTA = 56;
const HORIZONTAL_RATIO = 1.35;

type MainAreaHandlers = {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
};

type DrawerHandlers = {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
};

type UseMobileDrawerPointerArgs = {
  enabled: boolean;
  drawerOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
};

/**
 * Edge swipe (right) opens drawer; horizontal swipe left on drawer closes it.
 * Uses pointer events only — no extra dependencies.
 */
export function useMobileDrawerPointer({
  enabled,
  drawerOpen,
  onOpen,
  onClose,
}: UseMobileDrawerPointerArgs): { mainAreaProps: MainAreaHandlers; drawerProps: DrawerHandlers } {
  const mainRef = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    fromEdge: boolean;
  }>({ pointerId: null, startX: 0, startY: 0, fromEdge: false });

  const drawerRef = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    tracking: boolean;
  }>({ pointerId: null, startX: 0, startY: 0, tracking: false });

  const mainPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || drawerOpen) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (e.clientX > EDGE_PX) return;
      mainRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        fromEdge: true,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [enabled, drawerOpen],
  );

  const mainPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || drawerOpen || !mainRef.current.fromEdge || mainRef.current.pointerId !== e.pointerId) return;
      const dx = e.clientX - mainRef.current.startX;
      const dy = e.clientY - mainRef.current.startY;
      if (dx > OPEN_DELTA && Math.abs(dx) > Math.abs(dy) * HORIZONTAL_RATIO) {
        const target = e.currentTarget;
        const id = e.pointerId;
        mainRef.current = { pointerId: null, startX: 0, startY: 0, fromEdge: false };
        try {
          target.releasePointerCapture(id);
        } catch {
          /* ignore */
        }
        onOpen();
      }
    },
    [enabled, drawerOpen, onOpen],
  );

  const mainPointerEnd = useCallback((e: React.PointerEvent) => {
    if (mainRef.current.pointerId !== e.pointerId) return;
    mainRef.current = { pointerId: null, startX: 0, startY: 0, fromEdge: false };
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const drawerPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || !drawerOpen) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      drawerRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        tracking: true,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [enabled, drawerOpen],
  );

  const drawerPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || !drawerOpen || !drawerRef.current.tracking || drawerRef.current.pointerId !== e.pointerId) return;
      const dx = e.clientX - drawerRef.current.startX;
      const dy = e.clientY - drawerRef.current.startY;
      if (dx < -CLOSE_DELTA && Math.abs(dx) > Math.abs(dy) * HORIZONTAL_RATIO) {
        const target = e.currentTarget;
        const id = e.pointerId;
        drawerRef.current = { pointerId: null, startX: 0, startY: 0, tracking: false };
        try {
          target.releasePointerCapture(id);
        } catch {
          /* ignore */
        }
        onClose();
      }
    },
    [enabled, drawerOpen, onClose],
  );

  const drawerPointerEnd = useCallback((e: React.PointerEvent) => {
    if (drawerRef.current.pointerId !== e.pointerId) return;
    drawerRef.current = { pointerId: null, startX: 0, startY: 0, tracking: false };
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const mainAreaProps: MainAreaHandlers = {
    onPointerDown: mainPointerDown,
    onPointerMove: mainPointerMove,
    onPointerUp: mainPointerEnd,
    onPointerCancel: mainPointerEnd,
  };

  const drawerProps: DrawerHandlers = {
    onPointerDown: drawerPointerDown,
    onPointerMove: drawerPointerMove,
    onPointerUp: drawerPointerEnd,
    onPointerCancel: drawerPointerEnd,
  };

  return { mainAreaProps, drawerProps };
}
