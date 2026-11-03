import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  Clipboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { OnboardingModal } from '@/components/OnboardingModal';
import type { ThemeColors } from '@/constants/theme';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { deleteLastCrash, initErrorLogger, readLastCrash, sendToTelegram } from '@/utils/logger';
import { isOnboardingDone, markOnboardingDone } from '@/utils/onboarding';

void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 250, fade: true });

function RootLayoutContent() {
  const { colorScheme, colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [isAppReady, setIsAppReady] = useState(false);
  const [crashText, setCrashText] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [isOnboardingFinishing, setIsOnboardingFinishing] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const prepareApp = async () => {
      try {
        initErrorLogger();

        try {
          if (isMounted && !isOnboardingDone()) setOnboardingVisible(true);
        } catch (error) {
          console.warn('Не удалось проверить прохождение онбординга', error);
          if (isMounted) setOnboardingVisible(true);
        }

        const savedCrash = await readLastCrash().catch((error: unknown) => {
          console.warn('Не удалось прочитать отчёт о предыдущем краше', error);
          return null;
        });
        if (isMounted && savedCrash !== null) setCrashText(savedCrash);
      } catch (error) {
        console.warn('Не удалось завершить инициализацию приложения', error);
      } finally {
        try {
          await SplashScreen.hideAsync();
        } catch (error) {
          console.warn('Не удалось скрыть экран загрузки', error);
        }
        if (isMounted) setIsAppReady(true);
      }
    };

    void prepareApp();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleCopy = async () => {
    if (crashText === null || isSending) return;

    try {
      Clipboard.setString(crashText);
      await deleteLastCrash();
      setCrashText(null);
      setActionError(null);
    } catch {
      setActionError('Не удалось скопировать текст. Попробуйте ещё раз.');
    }
  };

  const handleRetry = async () => {
    if (crashText === null || isSending) return;

    setIsSending(true);
    setActionError(null);

    try {
      const sent = await sendToTelegram(crashText);
      if (!sent) {
        setActionError('Отправка не удалась. Проверьте интернет и настройки Telegram.');
        return;
      }

      await deleteLastCrash();
      setCrashText(null);
    } catch {
      setActionError('Отправка не удалась. Скопируйте текст вручную.');
    } finally {
      setIsSending(false);
    }
  };

  const handleOnboardingFinish = async () => {
    if (isOnboardingFinishing) return;
    setIsOnboardingFinishing(true);

    try {
      await markOnboardingDone();
    } catch (error) {
      // Не блокируем приложение: при ошибке записи обучение просто появится снова.
      console.warn('Не удалось сохранить прохождение онбординга', error);
    } finally {
      setOnboardingVisible(false);
      setIsOnboardingFinishing(false);
    }
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style={isAppReady && colorScheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        {/* Свайп от края экрана на iOS отключён: он мешает рисовать у края
            и выходил бы из проекта без вопроса о несохранённых изменениях. */}
        <Stack.Screen name="project/[id]" options={{ gestureEnabled: false }} />
      </Stack>

      <Modal
        visible={isAppReady && crashText !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isSending) setCrashText(null);
        }}
      >
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <Text style={styles.title}>Ошибка предыдущего запуска</Text>
            <Text style={styles.instruction}>
              Если отправка не удалась, скопируйте текст и отправьте его разработчику в Telegram
            </Text>

            <ScrollView style={styles.logScroll} nestedScrollEnabled>
              <Text selectable style={styles.logText}>
                {crashText ?? ''}
              </Text>
            </ScrollView>

            {actionError ? <Text style={styles.error}>{actionError}</Text> : null}

            <View style={styles.buttons}>
              <Pressable
                accessibilityRole="button"
                disabled={isSending}
                onPress={() => void handleCopy()}
                style={[styles.button, styles.copyButton, isSending && styles.buttonDisabled]}
              >
                <Text style={styles.buttonText}>Скопировать текст</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isSending}
                onPress={() => void handleRetry()}
                style={[styles.button, styles.retryButton, isSending && styles.buttonDisabled]}
              >
                <Text style={styles.buttonText}>{isSending ? 'Отправка…' : 'Повторить отправку'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <OnboardingModal
        visible={isAppReady && onboardingVisible && crashText === null}
        isFinishing={isOnboardingFinishing}
        onFinish={() => void handleOnboardingFinish()}
      />

      {!isAppReady && (
        <View style={styles.splashOverlay}>
          <Text style={styles.splashText}>Chertilla</Text>
        </View>
      )}
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootLayoutContent />
    </ThemeProvider>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    splashOverlay: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FFFFFF',
    },
    splashText: {
      color: '#111111',
      fontSize: 34,
      fontWeight: '600',
      letterSpacing: 0.5,
    },
    backdrop: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
      backgroundColor: colors.overlay,
    },
    card: {
      width: '100%',
      maxWidth: 560,
      maxHeight: '90%',
      padding: 20,
      borderRadius: 12,
      backgroundColor: colors.surface,
    },
    title: {
      marginBottom: 10,
      color: colors.text,
      fontSize: 20,
      fontWeight: '700',
    },
    instruction: {
      marginBottom: 14,
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },
    logScroll: {
      flexGrow: 0,
      maxHeight: 340,
      marginBottom: 14,
      padding: 10,
      borderRadius: 6,
      backgroundColor: colors.surfaceSecondary,
    },
    logText: {
      color: colors.textSecondary,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 12,
      lineHeight: 18,
    },
    error: {
      marginBottom: 12,
      color: colors.danger,
      fontSize: 13,
      lineHeight: 18,
    },
    buttons: {
      gap: 10,
    },
    button: {
      minHeight: 46,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 8,
    },
    copyButton: {
      backgroundColor: colors.primary,
    },
    retryButton: {
      backgroundColor: colors.accent,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonText: {
      color: colors.onAccent,
      fontSize: 15,
      fontWeight: '600',
      textAlign: 'center',
    },
  });
