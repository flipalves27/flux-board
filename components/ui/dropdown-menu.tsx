"use client";

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import type { ComponentPropsWithoutRef } from "react";

const contentClass =
  "z-[var(--flux-z-dropdown)] min-w-[8rem] overflow-hidden rounded-lg border border-[var(--flux-border-default)] bg-[var(--flux-surface-card)] p-1 text-[var(--flux-text)] shadow-[0_8px_24px_var(--flux-black-alpha-16)]";

const itemClass =
  "relative flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-[11px] font-medium outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-[var(--flux-surface-hover)] data-[highlighted]:text-[var(--flux-text)]";

export const DropdownMenu = DropdownMenuPrimitive.Root;

export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export const DropdownMenuContent = ({
  className = "",
  sideOffset = 4,
  align = "start",
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      sideOffset={sideOffset}
      align={align}
      className={`${contentClass} ${className}`.trim()}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
);

export const DropdownMenuItem = ({
  className = "",
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>) => (
  <DropdownMenuPrimitive.Item className={`${itemClass} ${className}`.trim()} {...props} />
);

export const DropdownMenuSeparator = ({
  className = "",
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>) => (
  <DropdownMenuPrimitive.Separator
    className={`-mx-1 my-1 h-px bg-[var(--flux-border-muted)] ${className}`.trim()}
    {...props}
  />
);
