import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import shell from './FeaturePageShell.module.css';

export interface FeaturePageShellProps {
  hero: ReactNode;
  children: ReactNode;
  pageClassName?: string;
  headerClassName?: string;
  mainClassName?: string;
}

/** Content shell for Sound / Library routes inside product chrome. */
export function FeaturePageShell({
  hero,
  children,
  pageClassName,
  headerClassName,
  mainClassName,
}: FeaturePageShellProps) {
  return (
    <div className={cn(shell.page, pageClassName)}>
      <header className={cn(shell.header, headerClassName)}>{hero}</header>
      <main className={cn(shell.main, mainClassName)}>{children}</main>
    </div>
  );
}
