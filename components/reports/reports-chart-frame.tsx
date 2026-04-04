"use client";

import type { ReactNode } from "react";

type ReportsChartFrameProps = {
  heightClassName: string;
  children: ReactNode;
};

export function ReportsChartFrame({ heightClassName, children }: ReportsChartFrameProps) {
  return <div className={`${heightClassName} w-full min-w-0`}>{children}</div>;
}

