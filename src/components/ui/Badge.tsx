import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-900',
  {
    variants: {
      variant: {
        default:
          'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30',
        secondary:
          'bg-zinc-800 text-zinc-300 border border-zinc-700/50',
        success:
          'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
        warning:
          'bg-amber-500/20 text-amber-400 border border-amber-500/30',
        destructive:
          'bg-red-500/20 text-red-400 border border-red-500/30',
        outline:
          'text-zinc-300 border border-zinc-700',
        ghost:
          'text-zinc-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={`${badgeVariants({ variant })} ${className || ''}`} {...props} />
  );
}

export { Badge, badgeVariants };
