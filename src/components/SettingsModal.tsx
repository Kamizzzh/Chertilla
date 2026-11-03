import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo, type ComponentProps } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ThemeColors } from '@/constants/theme';
import { useTheme, type ThemeMode } from '@/context/ThemeContext';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

type Props = {
  visible: boolean;
  onClose: () => void;
};

const THEME_OPTIONS: { id: ThemeMode; label: string; icon: IconName }[] = [
  { id: 'light', label: 'Светлая тема', icon: 'weather-sunny' },
  { id: 'dark', label: 'Тёмная тема', icon: 'weather-night' },
  { id: 'system', label: 'Как в системе', icon: 'cellphone-cog' },
];

/** Небольшое окно настроек интерфейса, доступное из меню проекта. */
export function SettingsModal({ visible, onClose }: Props) {
  const { colors, mode, setTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Настройки</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Закрыть настройки"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}>
              <MaterialCommunityIcons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          <Text style={styles.sectionTitle}>Оформление</Text>
          <View style={styles.options}>
            {THEME_OPTIONS.map((option) => {
              const selected = mode === option.id;
              const color = selected ? colors.accentText : colors.textSecondary;
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected }}
                  onPress={() => setTheme(option.id)}
                  style={({ pressed }) => [
                    styles.option,
                    selected && styles.optionSelected,
                    pressed && styles.optionPressed,
                  ]}>
                  <MaterialCommunityIcons name={option.icon} size={23} color={color} />
                  <Text style={[styles.optionText, { color }]}>{option.label}</Text>
                  {selected && <MaterialCommunityIcons name="check" size={22} color={color} />}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      backgroundColor: colors.overlay,
    },
    card: {
      width: '100%',
      maxWidth: 400,
      padding: 18,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 18,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
    },
    closeButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceSecondary,
    },
    closeButtonPressed: {
      backgroundColor: colors.surfacePressed,
    },
    sectionTitle: {
      marginBottom: 8,
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
    },
    options: {
      gap: 8,
    },
    option: {
      minHeight: 50,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
    },
    optionSelected: {
      backgroundColor: colors.accentSurface,
      borderColor: colors.accent,
    },
    optionPressed: {
      backgroundColor: colors.surfacePressed,
    },
    optionText: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
    },
  });
