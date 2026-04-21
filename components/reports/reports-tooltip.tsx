"use client";

import { Tooltip } from "recharts";
import { REPORTS_TOOLTIP_CONTENT_STYLE } from "@/components/reports/reports-chart-theme";

type ReportsTooltipProps = {
  labelStyle?: Record<string, string>;
  formatter?: (value: number) => [string, string];
};

export function ReportsTooltip({ labelStyle, formatter }: ReportsTooltipProps) {
  return <Tooltip contentStyle={REPORTS_TOOLTIP_CONTENT_STYLE} labelStyle={labelStyle} formatter={formatter} />;
}

