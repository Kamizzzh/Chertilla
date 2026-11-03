import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ThemeColors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';

const SLIDES = [
  {
    icon: 'pencil',
    title: 'Рисуйте примитивы',
    description: 'Выберите инструмент на нижней панели и коснитесь холста.',
  },
  {
    icon: 'axis-arrow',
    title: 'Держите точные углы',
    description: 'Используйте Орто-режим для прямых линий.',
  },
  {
    icon: 'magnet',
    title: 'Соединяйте фигуры точно',
    description: 'Привязки помогают соединять фигуры точно.',
  },
  {
    icon: 'bug-outline',
    title: 'Сообщайте о проблемах',
    description: 'Отправляйте баги через 🐞.',
  },
] as const;

type Props = {
  visible: boolean;
  isFinishing: boolean;
  onFinish: () => void;
};

/** Короткое обучение при первом запуске. Пропуск и завершение равнозначны. */
export function OnboardingModal({ visible, isFinishing, onFinish }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [slideIndex, setSlideIndex] = useState(0);
  const slide = SLIDES[slideIndex];
  const isLastSlide = slideIndex === SLIDES.length - 1;

  const handleFinish = () => {
    if (!isFinishing) onFinish();
  };

  const handleNext = () => {
    if (isFinishing) return;
    if (isLastSlide) {
      onFinish();
    } else {
      setSlideIndex((index) => index + 1);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onShow={() => setSlideIndex(0)}
      onRequestClose={handleFinish}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Быстрый старт</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Пропустить обучение"
              disabled={isFinishing}
              onPress={handleFinish}
              style={({ pressed }) => [
                styles.skipButton,
                pressed && styles.skipButtonPressed,
                isFinishing && styles.buttonDisabled,
              ]}>
              <Text style={styles.skipText}>Пропустить</Text>
            </Pressable>
          </View>

          <View style={styles.iconContainer}>
            <MaterialCommunityIcons name={slide.icon} size={38} color={colors.accentText} />
          </View>
          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.description}>{slide.description}</Text>

          <View style={styles.pagination} accessibilityLabel={`Слайд ${slideIndex + 1} из ${SLIDES.length}`}>
            {SLIDES.map((item, index) => (
              <View
                key={item.title}
                style={[styles.dot, index === slideIndex && styles.dotActive]}
              />
            ))}
          </View>
          <Text style={styles.counter}>
            {slideIndex + 1} / {SLIDES.length}
          </Text>

          <Pressable
            accessibilityRole="button"
            disabled={isFinishing}
            onPress={handleNext}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
              isFinishing && styles.buttonDisabled,
            ]}>
            <Text style={styles.primaryButtonText}>
              {isFinishing ? 'Сохранение…' : isLastSlide ? 'Начать работу' : 'Далее'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
      backgroundColor: colors.overlay,
    },
    dialog: {
      width: '100%',
      maxWidth: 420,
      padding: 24,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    headerTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textMuted,
    },
    skipButton: {
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 6,
    },
    skipButtonPressed: {
      backgroundColor: colors.surfacePressed,
    },
    skipText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.accentText,
    },
    iconContainer: {
      width: 72,
      height: 72,
      marginTop: 28,
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 36,
      backgroundColor: colors.accentSurface,
    },
    title: {
      marginTop: 20,
      fontSize: 23,
      lineHeight: 30,
      fontWeight: '700',
      textAlign: 'center',
      color: colors.text,
    },
    description: {
      minHeight: 56,
      marginTop: 12,
      fontSize: 16,
      lineHeight: 24,
      textAlign: 'center',
      color: colors.textSecondary,
    },
    pagination: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      marginTop: 24,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.surfacePressed,
    },
    dotActive: {
      width: 24,
      backgroundColor: colors.accent,
    },
    counter: {
      marginTop: 10,
      fontSize: 12,
      textAlign: 'center',
      color: colors.textSubtle,
    },
    primaryButton: {
      minHeight: 50,
      marginTop: 24,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
      borderRadius: 10,
      backgroundColor: colors.primary,
    },
    primaryButtonPressed: {
      backgroundColor: colors.primaryPressed,
    },
    primaryButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.onPrimary,
    },
    buttonDisabled: {
      opacity: 0.55,
    },
  });
