import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ThemeColors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import type { UCS, UcsCreationMethod } from '@/types/ucs';

type Props = {
  visible: boolean;
  systems: UCS[];
  activeId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

/** Окно выбора и удаления сохранённых систем координат. */
export function UcsModal({ visible, systems, activeId, onSelect, onDelete, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleSelect = (id: string) => {
    onSelect(id);
    onClose();
  };

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
            <Text accessibilityRole="header" style={styles.title}>
              Системы координат
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Закрыть окно систем координат"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                pressed && styles.closeButtonPressed,
              ]}>
              <MaterialCommunityIcons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          {systems.length === 0 ? (
            <Text style={styles.emptyText}>Нет сохранённых СК</Text>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {systems.map((system) => {
                const active = system.id === activeId;
                const parameters = `dx: ${system.dx.toFixed(3)} мм  dy: ${system.dy.toFixed(3)} мм  ∠ ${system.angle.toFixed(3)}°`;

                return (
                  <View
                    key={system.id}
                    style={[styles.row, active && styles.rowActive]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${system.name}. ${parameters}`}
                      accessibilityHint="Выбрать систему координат и закрыть окно"
                      accessibilityState={{ selected: active }}
                      onPress={() => handleSelect(system.id)}
                      style={({ pressed }) => [
                        styles.rowContent,
                        pressed && styles.rowContentPressed,
                      ]}>
                      <View style={styles.textContainer}>
                        <Text
                          numberOfLines={1}
                          style={[styles.name, active && styles.nameActive]}>
                          {system.name}
                        </Text>
                        <Text style={styles.parameters}>{parameters}</Text>
                      </View>
                      {active ? (
                        <MaterialCommunityIcons
                          name="check"
                          size={24}
                          color={colors.accentText}
                          style={styles.checkIcon}
                        />
                      ) : null}
                    </Pressable>

                    {system.id !== 'wcs' ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Удалить систему координат ${system.name}`}
                        hitSlop={4}
                        onPress={() => onDelete(system.id)}
                        style={({ pressed }) => [
                          styles.deleteButton,
                          pressed && styles.deleteButtonPressed,
                        ]}>
                        <MaterialCommunityIcons
                          name="trash-can-outline"
                          size={22}
                          color={colors.danger}
                        />
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

type UcsMethodModalProps = {
  visible: boolean;
  onSelect: (method: UcsCreationMethod) => void;
  onClose: () => void;
};

/** Выбор способа создания СК: только смещение или смещение с направлением оси X. */
export function UcsMethodModal({ visible, onSelect, onClose }: UcsMethodModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, styles.methodCard]}>
          <Text accessibilityRole="header" style={styles.title}>
            Способ создания СК
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Смещение. Только точка 0,0"
            onPress={() => onSelect('originOnly')}
            style={({ pressed }) => [styles.methodOption, pressed && styles.rowContentPressed]}>
            <Text style={styles.name}>Смещение (Только точка 0,0)</Text>
            <Text style={styles.methodDescription}>Один тап по центру, угол 0°</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="По направлению оси X"
            onPress={() => onSelect('xAxis')}
            style={({ pressed }) => [styles.methodOption, pressed && styles.rowContentPressed]}>
            <Text style={styles.name}>По направлению оси X</Text>
            <Text style={styles.methodDescription}>Центр, затем направление оси X</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [
              styles.methodCancel,
              pressed && styles.closeButtonPressed,
            ]}>
            <Text style={styles.methodCancelText}>Отмена</Text>
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
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      backgroundColor: colors.overlay,
    },
    card: {
      width: '100%',
      maxWidth: 420,
      maxHeight: '80%',
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
      marginBottom: 16,
    },
    title: {
      flex: 1,
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
    emptyText: {
      paddingVertical: 28,
      textAlign: 'center',
      fontSize: 15,
      color: colors.textMuted,
    },
    list: {
      flexGrow: 0,
    },
    listContent: {
      gap: 8,
    },
    row: {
      minHeight: 68,
      flexDirection: 'row',
      alignItems: 'center',
      overflow: 'hidden',
      borderRadius: 10,
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
    },
    rowActive: {
      backgroundColor: colors.accentSurface,
      borderColor: colors.accent,
    },
    rowContent: {
      flex: 1,
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingLeft: 14,
      paddingRight: 10,
      paddingVertical: 10,
    },
    rowContentPressed: {
      backgroundColor: colors.surfacePressed,
    },
    textContainer: {
      flex: 1,
      gap: 4,
    },
    name: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    nameActive: {
      color: colors.accentText,
    },
    parameters: {
      fontSize: 12,
      color: colors.textMuted,
      fontVariant: ['tabular-nums'],
    },
    checkIcon: {
      marginLeft: 4,
    },
    deleteButton: {
      width: 44,
      height: 44,
      marginRight: 6,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deleteButtonPressed: {
      backgroundColor: colors.dangerSurface,
    },
    methodCard: {
      gap: 12,
    },
    methodOption: {
      gap: 4,
      padding: 14,
      borderRadius: 10,
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
    },
    methodDescription: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.textMuted,
    },
    methodCancel: {
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: colors.surfaceSecondary,
    },
    methodCancelText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
  });
