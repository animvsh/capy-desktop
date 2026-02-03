import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-indigo-600 text-white hover:bg-indigo-500 focus-visible:ring-indigo-500 shadow-lg shadow-indigo-500/20',
        destructive:
          'bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-500 shadow-lg shadow-red-500/20',
        outline:
          'border border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-white focus-visible:ring-zinc-500',
        secondary:
          'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white focus-visible:ring-zinc-500',
        ghost:
          'text-zinc-400 hover:bg-zinc-800 hover:text-white focus-visible:ring-zinc-500',
        link:
          'text-indigo-400 underline-offset-4 hover:underline hover:text-indigo-300',
        success:
          'bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:ring-emerald-500 shadow-lg shadow-emerald-500/20',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-11 px-6 text-base',
        xl: 'h-12 px-8 text-base',
        icon: 'h-10 w-10',
        'icon-sm': 'h-8 w-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={`${buttonVariants({ variant, size })} ${className || ''}`}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
