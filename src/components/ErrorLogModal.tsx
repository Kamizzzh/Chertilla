import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { ThemeColors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import {
  getErrorLog,
  subscribeErrorLog,
  type ErrorLogEntry,
} from '@/utils/errorLog';

type Props = {
  visible: boolean;
  onClose: () => void;
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Дата неизвестна';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** Список ошибок и отдельное детальное окно с полным стеком. */
export function ErrorLogModal({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [entries, setEntries] = useState<ErrorLogEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<ErrorLogEntry | null>(null);

  useEffect(() => {
    if (!visible) return;

    let active = true;
    const unsubscribe = subscribeErrorLog((next) => {
      if (active) setEntries(next);
    });
    void getErrorLog().then((next) => {
      if (active) setEntries(next);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [visible]);

  const closeList = () => {
    setSelectedEntry(null);
    onClose();
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeList}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <View style={styles.header}>
              <View style={styles.titleBlock}>
                <Text style={styles.title}>Журнал ошибок</Text>
                <Text style={styles.subtitle}>Последние 50 записей</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Закрыть журнал ошибок"
                hitSlop={8}
                onPress={closeList}
                style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}>
                <MaterialCommunityIcons name="close" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>

            <FlatList
              data={entries}
              keyExtractor={(item) => item.id}
              style={styles.list}
              contentContainerStyle={entries.length === 0 ? styles.emptyContent : undefined}
              keyboardShouldPersistTaps="handled"
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              ListEmptyComponent={
                <View style={styles.emptyBlock}>
                  <MaterialCommunityIcons
                    name="check-circle-outline"
                    size={38}
                    color={colors.textSubtle}
                  />
                  <Text style={styles.emptyText}>Ошибок пока нет</Text>
                </View>
              }
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Ошибка от ${formatDate(item.timestamp)}: ${item.message}`}
                  onPress={() => setSelectedEntry(item)}
                  style={({ pressed }) => [styles.entry, pressed && styles.entryPressed]}>
                  <View style={styles.entryTextBlock}>
                    <Text style={styles.entryDate}>{formatDate(item.timestamp)}</Text>
                    <Text style={styles.entryMessage} numberOfLines={2}>
                      {item.message}
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={22}
                    color={colors.textSubtle}
                  />
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={selectedEntry !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setSelectedEntry(null)}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <View style={styles.header}>
              <View style={styles.titleBlock}>
                <Text style={styles.title}>Подробности ошибки</Text>
                {selectedEntry && (
                  <Text style={styles.subtitle}>{formatDate(selectedEntry.timestamp)}</Text>
                )}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Закрыть подробности ошибки"
                hitSlop={8}
                onPress={() => setSelectedEntry(null)}
                style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}>
                <MaterialCommunityIcons name="close" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>

            {selectedEntry && (
              <>
                <Text style={styles.detailMessage}>{selectedEntry.message}</Text>
                <ScrollView style={styles.detailsScroll} nestedScrollEnabled>
                  <Text selectable style={styles.detailsText}>
                    {selectedEntry.details}
                  </Text>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
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
      maxWidth: 620,
      maxHeight: '86%',
      padding: 18,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 14,
    },
    titleBlock: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
    },
    subtitle: {
      marginTop: 3,
      fontSize: 12,
      color: colors.textSubtle,
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
    list: {
      flexGrow: 0,
    },
    separator: {
      height: 8,
    },
    entry: {
      minHeight: 68,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: 10,
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
    },
    entryPressed: {
      backgroundColor: colors.surfacePressed,
    },
    entryTextBlock: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    entryDate: {
      fontSize: 12,
      color: colors.textSubtle,
    },
    entryMessage: {
      fontSize: 14,
      lineHeight: 19,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    emptyContent: {
      flexGrow: 1,
      minHeight: 220,
      justifyContent: 'center',
    },
    emptyBlock: {
      alignItems: 'center',
      gap: 12,
    },
    emptyText: {
      fontSize: 15,
      color: colors.textSubtle,
    },
    detailMessage: {
      marginBottom: 12,
      fontSize: 16,
      lineHeight: 22,
      fontWeight: '700',
      color: colors.dangerText,
    },
    detailsScroll: {
      flexGrow: 0,
      maxHeight: 460,
      padding: 12,
      borderRadius: 8,
      backgroundColor: colors.surfaceSecondary,
    },
    detailsText: {
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 12,
      lineHeight: 18,
      color: colors.textSecondary,
    },
  });
