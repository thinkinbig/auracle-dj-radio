import { useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { LoreToggle } from './LoreToggle';
import styles from './LoreDisclosure.module.css';

export interface LoreDisclosureProps {
  lore: string;
  id: string;
  tone?: 'purple' | 'library';
  className?: string;
  bodyClassName?: string;
}

export function LoreDisclosure({ lore, id, tone = 'purple', className, bodyClassName }: LoreDisclosureProps) {
  const [expanded, setExpanded] = useState(false);
  const text = lore.trim();
  if (!text) return null;

  return (
    <>
      <LoreToggle
        expanded={expanded}
        onToggle={() => setExpanded((open) => !open)}
        controlsId={id}
        tone={tone}
      />
      {expanded ? (
        <p id={id} className={cn(styles.body, bodyClassName)}>
          {text}
        </p>
      ) : null}
    </>
  );
}
