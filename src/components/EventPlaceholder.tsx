'use client';

import { Calendar } from 'lucide-react';

interface EventPlaceholderProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function EventPlaceholder({ size = 'md', className = '' }: EventPlaceholderProps) {
  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-full h-48',
    lg: 'w-full h-64',
  };

  const iconSizes = {
    sm: 'w-5 h-5',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };

  return (
    <div
      className={`${sizeClasses[size]} ${className} relative overflow-hidden rounded-lg bg-gradient-to-br from-muted via-muted/80 to-muted/60`}
    >
      {/* Subtle pattern overlay */}
      <div className="absolute inset-0 opacity-[0.03]">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="currentColor" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>
      
      {/* Gradient accent */}
      <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-gradient-to-bl from-primary/10 to-transparent" />
      
      {/* Content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
        <Calendar className={`${iconSizes[size]} opacity-40`} />
        {size !== 'sm' && (
          <span className="mt-2 text-sm font-medium opacity-60 tracking-wide">704 Collective</span>
        )}
      </div>
      
      {/* Bottom accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
    </div>
  );
}
