import * as React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <input
        type={type}
        className={`
          flex h-10 w-full rounded-lg border bg-zinc-900/50 px-3 py-2 text-sm text-white
          placeholder:text-zinc-500
          transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-900
          disabled:cursor-not-allowed disabled:opacity-50
          ${error 
            ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500' 
            : 'border-zinc-700/50 focus:border-indigo-500 focus:ring-indigo-500 hover:border-zinc-600'
          }
          ${className || ''}
        `}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <textarea
        className={`
          flex min-h-[80px] w-full rounded-lg border bg-zinc-900/50 px-3 py-2 text-sm text-white
          placeholder:text-zinc-500
          transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-900
          disabled:cursor-not-allowed disabled:opacity-50
          resize-none
          ${error 
            ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500' 
            : 'border-zinc-700/50 focus:border-indigo-500 focus:ring-indigo-500 hover:border-zinc-600'
          }
          ${className || ''}
        `}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export { Input, Textarea };
