"use client";

import { ReportsTabButton } from "./reports-tab-button";

type ReportsTabItem<T extends string> = {
  id: T;
  label: string;
};

type ReportsTabBarProps<T extends string> = {
  items: Array<ReportsTabItem<T>>;
  value: T;
  onChange: (value: T) => void;
  compact?: boolean;
  className?: string;
};

export function ReportsTabBar<T extends string>({
  items,
  value,
  onChange,
  compact = false,
  className = "flex flex-wrap gap-2 border-b border-[var(--flux-chrome-alpha-08)] pb-2",
}: ReportsTabBarProps<T>) {
  return (
    <div className={className}>
      {items.map((item) => (
        <ReportsTabButton
          key={item.id}
          label={item.label}
          active={value === item.id}
          onClick={() => onChange(item.id)}
          compact={compact}
        />
      ))}
    </div>
  );
}

