import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  ChevronUp,
  Mic,
  Pause,
  Play,
  SkipForward,
} from 'lucide-react';

type IconProps = { size?: number; className?: string };

function sized(Icon: LucideIcon, defaultSize = 24) {
  return function AuracleIcon({ size = defaultSize, className }: IconProps) {
    return <Icon size={size} className={className} aria-hidden strokeWidth={2} />;
  };
}

export const IconPlay = sized(Play);
export const IconPause = sized(Pause);
export const IconArrowRight = sized(ArrowRight, 20);
export const IconChevronUp = sized(ChevronUp);
export const IconMic = sized(Mic, 20);
export const IconSkipNext = sized(SkipForward);
