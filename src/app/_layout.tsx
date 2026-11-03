import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { OnboardingModal } from '@/components/OnboardingModal';
import type { ThemeColors } from '@/constants/theme';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { recordErrorReport } from '@/utils/errorLog';
import { deleteLastCrash, initErrorLogger, readLastCrash } from '@/utils/logger';
import { isOnboardingDone, markOnboardingDone } from '@/utils/onboarding';

void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 250, fade: true });

function RootLayoutContent() {
  const { colorScheme, colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [isAppReady, setIsAppReady] = useState(false);
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [isOnboardingFinishing, setIsOnboardingFinishing] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const prepareApp = async () => {
      try {
        initErrorLogger();

        // Старый отчёт больше не показываем при запуске: переносим его в общий журнал.
        const savedCrash = await readLastCrash();
        if (savedCrash !== null) {
          recordErrorReport(savedCrash);
          await deleteLastCrash();
        }

        try {
          if (isMounted && !isOnboardingDone()) setOnboardingVisible(true);
        } catch (error) {
          console.warn('Не удалось проверить прохождение онбординга', error);
          if (isMounted) setOnboardingVisible(true);
        }
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

      <OnboardingModal
        visible={isAppReady && onboardingVisible}
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
  });
