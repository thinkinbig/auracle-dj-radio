import type { AuthUser } from '@auracle/shared';
import { OnboardingPage } from './OnboardingPage';

/** The pre-session screen: pick the mood/intent before the radio starts. */
export function MoodPickerScreen({ user }: { user: AuthUser }) {
  return <OnboardingPage user={user} />;
}
