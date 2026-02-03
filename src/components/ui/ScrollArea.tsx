import * as React from 'react';

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'vertical' | 'horizontal' | 'both';
}

const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, children, orientation = 'vertical', ...props }, ref) => {
    const overflowClasses = {
      vertical: 'overflow-y-auto overflow-x-hidden',
      horizontal: 'overflow-x-auto overflow-y-hidden',
      both: 'overflow-auto',
    };

    return (
      <div
        ref={ref}
        className={`
          relative
          ${overflowClasses[orientation]}
          scrollbar-thin
          scrollbar-track-transparent
          scrollbar-thumb-zinc-700
          hover:scrollbar-thumb-zinc-600
          ${className || ''}
        `}
        {...props}
      >
        {children}
      </div>
    );
  }
);
ScrollArea.displayName = 'ScrollArea';

export { ScrollArea };
