import { File, Paths } from 'expo-file-system';

const ONBOARDING_FILE_NAME = 'onboarding_done.json';

function onboardingFile(): File {
  return new File(Paths.document, ONBOARDING_FILE_NAME);
}

/** Онбординг считается пройденным по самому наличию файла флага. */
export function isOnboardingDone(): boolean {
  return onboardingFile().exists;
}

/** Сохраняет отметку после прохождения или пропуска обучения. */
export async function markOnboardingDone(): Promise<void> {
  const file = onboardingFile();
  if (!file.exists) file.create();
  await file.write(
    JSON.stringify({
      version: 1,
      completedAt: new Date().toISOString(),
    }),
  );
}
