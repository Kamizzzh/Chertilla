import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
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

import { deleteLastCrash, initErrorLogger, readLastCrash, sendToTelegram } from '@/utils/logger';

export default function RootLayout() {
  const [crashText, setCrashText] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    initErrorLogger();
    let isMounted = true;

    const checkSavedCrash = async () => {
      const savedCrash = await readLastCrash();
      if (isMounted && savedCrash !== null) setCrashText(savedCrash);
    };

    void checkSavedCrash();
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

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        {/* Свайп от края экрана на iOS отключён: он мешает рисовать у края
            и выходил бы из проекта без вопроса о несохранённых изменениях. */}
        <Stack.Screen name="project/[id]" options={{ gestureEnabled: false }} />
      </Stack>

      <Modal
        visible={crashText !== null}
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
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  card: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '90%',
    padding: 20,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  title: {
    marginBottom: 10,
    color: '#1F2933',
    fontSize: 20,
    fontWeight: '700',
  },
  instruction: {
    marginBottom: 14,
    color: '#4B5563',
    fontSize: 14,
    lineHeight: 20,
  },
  logScroll: {
    flexGrow: 0,
    maxHeight: 340,
    marginBottom: 14,
    padding: 10,
    borderRadius: 6,
    backgroundColor: '#F1F3F5',
  },
  logText: {
    color: '#17202A',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
  error: {
    marginBottom: 12,
    color: '#C92A2A',
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
    backgroundColor: '#495057',
  },
  retryButton: {
    backgroundColor: '#208AEF',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});
