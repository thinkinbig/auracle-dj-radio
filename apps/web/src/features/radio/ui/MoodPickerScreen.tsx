import { useAuth } from '@/features/marketing/AuthProvider';
import { OnboardingPage } from './OnboardingPage';

/** The pre-session screen: pick the mood/intent before the radio starts. */
export function MoodPickerScreen() {
  const { user } = useAuth();
  return <OnboardingPage user={user!} />;
}
