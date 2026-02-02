import * as React from 'react';

import { cn } from '@/lib/utils';

type BadgeVariant = 'ember' | 'moss' | 'stone';

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

const badgeStyles: Record<BadgeVariant, string> = {
  ember: 'border-ember-500/40 bg-ember-500/10 text-ember-600',
  moss: 'border-moss-500/40 bg-moss-500/10 text-moss-600',
  stone: 'border-ink-900/20 bg-parchment-100 text-ink-700',
};

export function Badge({ className, variant = 'stone', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide',
        badgeStyles[variant],
        className,
      )}
      {...props}
    />
  );
}
