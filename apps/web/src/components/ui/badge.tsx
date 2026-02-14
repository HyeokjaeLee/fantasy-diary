import * as React from 'react';

import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'solid';

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

const badgeStyles: Record<BadgeVariant, string> = {
  default: 'border-2 border-black bg-white text-black',
  solid: 'border-2 border-black bg-black text-white',
};

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-none border px-3 py-1 text-xs font-semibold uppercase tracking-wide',
        badgeStyles[variant],
        className,
      )}
      {...props}
    />
  );
}
