"use client";

import { motion, useReducedMotion } from "framer-motion";

/** Soft gradient orbs behind landing content (doc v2 ambient layer). */
export function LandingAmbientOrbs({ className = "" }: { className?: string }) {
  const reduce = useReducedMotion();

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`.trim()} aria-hidden>
      <motion.div
        className="absolute -left-[20%] top-[10%] h-[min(520px,55vw)] w-[min(520px,55vw)] rounded-full opacity-[0.22]"
        style={{
          background: `radial-gradient(circle at 40% 40%, var(--flux-primary-alpha-35), transparent 68%)`,
          filter: "blur(48px)",
        }}
        animate={
          reduce
            ? undefined
            : {
                x: [0, 18, 0],
                y: [0, -12, 0],
              }
        }
        transition={reduce ? undefined : { duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-[15%] top-[28%] h-[min(440px,48vw)] w-[min(440px,48vw)] rounded-full opacity-[0.18]"
        style={{
          background: `radial-gradient(circle at 50% 50%, var(--flux-secondary-alpha-35), transparent 65%)`,
          filter: "blur(44px)",
        }}
        animate={
          reduce
            ? undefined
            : {
                x: [0, -14, 0],
                y: [0, 16, 0],
              }
        }
        transition={reduce ? undefined : { duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-[5%] left-[25%] h-[min(380px,42vw)] w-[min(380px,42vw)] rounded-full opacity-[0.14]"
        style={{
          background: `radial-gradient(circle at 50% 50%, var(--flux-accent-alpha-35), transparent 70%)`,
          filter: "blur(52px)",
        }}
        animate={
          reduce
            ? undefined
            : {
                scale: [1, 1.06, 1],
                opacity: [0.12, 0.18, 0.12],
              }
        }
        transition={reduce ? undefined : { duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
