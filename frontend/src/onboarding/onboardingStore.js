// Tracks whether the user has already been through the Welcome / "Get
// Started" screen, persisted on-device so Splash can skip straight to
// Home on every launch after the first one. Same plain async-function
// pattern as the other *Store modules, just backed by AsyncStorage
// instead of in-memory state since this needs to survive app restarts.
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_KEY = '@a2salah/has_onboarded';

export async function hasCompletedOnboarding() {
  try {
    return (await AsyncStorage.getItem(ONBOARDING_KEY)) === 'true';
  } catch (err) {
    // If storage can't be read for some reason, fail safe by treating the
    // user as not-yet-onboarded — worst case they see Welcome again,
    // rather than silently skipping it due to a storage error.
    console.warn('Failed to read onboarding flag', err.message);
    return false;
  }
}

export async function markOnboardingComplete() {
  try {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
  } catch (err) {
    console.warn('Failed to persist onboarding flag', err.message);
  }
}
