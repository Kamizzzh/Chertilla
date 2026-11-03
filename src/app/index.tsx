import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AlertButton,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProjectNameModal } from '@/components/ProjectNameModal';
import type { ThemeColors } from '@/constants/theme';
import { APP_VERSION } from '@/constants/version';
import { useTheme } from '@/context/ThemeContext';
import { createDebugProject, type DebugLevel } from '@/utils/debugProject';
import { recordError } from '@/utils/errorLog';
import { createProject, deleteProject, getProjects, type ProjectMeta } from '@/utils/storage';

/** Дата для списка: «29.10.2026 14:05». */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function openProject(id: string) {
  router.push({ pathname: '/project/[id]', params: { id } });
}

/** Главное меню: список проектов, создание нового и отладочный проект. */
export default function MenuScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [nameModalVisible, setNameModalVisible] = useState(false);
  // Идёт работа с файлами (создание проекта) — кнопки временно не нажимаются,
  // чтобы двойной тап не создал два проекта.
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setProjects(await getProjects());
    } catch (e) {
      recordError(e, 'Не удалось прочитать список проектов');
    }
  }, []);

  // Список перечитывается каждый раз при возврате в меню: в проекте могли сохранить изменения.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const handleCreate = async (name: string) => {
    setNameModalVisible(false);
    setBusy(true);
    try {
      openProject(await createProject(name));
    } catch (e) {
      recordError(e, 'Не удалось создать проект');
    } finally {
      setBusy(false);
    }
  };

  const openDebug = async (level: DebugLevel) => {
    setBusy(true);
    try {
      openProject(await createDebugProject(level));
    } catch (e) {
      recordError(e, 'Не удалось создать тестовый проект');
    } finally {
      setBusy(false);
    }
  };

  /** Выбор уровня нагрузки. На Android в Alert не больше 3 кнопок, поэтому «Отмена» там —
   *  тап мимо окна или кнопка «Назад» (cancelable), а на iOS — отдельная кнопка. */
  const handleDebug = () => {
    const levels: AlertButton[] = [
      { text: 'Софт (30)', onPress: () => openDebug('soft') },
      { text: 'Медиум (300)', onPress: () => openDebug('medium') },
      { text: 'Хард (1500)', onPress: () => openDebug('hard') },
    ];
    Alert.alert(
      'Тестовый проект',
      'Выберите уровень нагрузки (количество фигур):',
      Platform.OS === 'ios' ? [...levels, { text: 'Отмена', style: 'cancel' }] : levels,
      { cancelable: true },
    );
  };

  const confirmDelete = (project: ProjectMeta) => {
    Alert.alert('Удалить проект?', `«${project.name}» будет удалён без возможности восстановления.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteProject(project.id);
          } catch (e) {
            recordError(e, 'Не удалось удалить проект');
          }
          refresh();
        },
      },
    ]);
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + 16,
          paddingLeft: insets.left + 16,
          paddingRight: insets.right + 16,
        },
      ]}>
      <View style={styles.header}>
        <Text style={styles.title}>Чертилла</Text>
        <Pressable
          onLongPress={() => {
            throw new Error('TEST CRASH: Проверка работы Telegram-логгера');
          }}>
          <Text style={styles.version}>v{APP_VERSION}</Text>
        </Pressable>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => setNameModalVisible(true)}
          disabled={busy}
          style={({ pressed }) => [
            styles.actionButton,
            styles.createButton,
            pressed && styles.createButtonPressed,
          ]}>
          <Text style={styles.actionButtonText}>+ Создать проект</Text>
        </Pressable>
        <Pressable
          onPress={handleDebug}
          disabled={busy}
          style={({ pressed }) => [
            styles.actionButton,
            styles.debugButton,
            pressed && styles.debugButtonPressed,
          ]}>
          <Text style={styles.actionButtonText}>Тест (Отладка)</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Проекты</Text>

      <FlatList
        data={projects}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <Text style={styles.empty}>Проектов пока нет. Нажмите «+ Создать проект».</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => openProject(item.id)}
            onLongPress={() => confirmDelete(item)}
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}>
            <Text style={styles.itemName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.itemDate}>{formatDate(item.date)}</Text>
          </Pressable>
        )}
      />

      <Text style={[styles.footnote, { marginBottom: insets.bottom + 8 }]}>
        Долгое нажатие на проект — удалить
      </Text>

      <ProjectNameModal
        visible={nameModalVisible}
        defaultName={`Проект ${projects.length + 1}`}
        onCancel={() => setNameModalVisible(false)}
        onSubmit={handleCreate}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 10,
      marginBottom: 20,
    },
    title: {
      fontSize: 30,
      fontWeight: '800',
      color: colors.text,
    },
    version: {
      fontSize: 12,
      color: colors.textSubtle,
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 24,
    },
    actionButton: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 10,
      alignItems: 'center',
    },
    createButton: {
      flex: 1,
      backgroundColor: colors.primary,
    },
    createButtonPressed: {
      backgroundColor: colors.primaryPressed,
    },
    // Оранжевая — чтобы отладочную кнопку не спутать с обычными действиями.
    debugButton: {
      backgroundColor: colors.debug,
    },
    debugButtonPressed: {
      backgroundColor: colors.debugPressed,
    },
    actionButtonText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.onPrimary,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    listContent: {
      paddingBottom: 16,
    },
    separator: {
      height: 8,
    },
    item: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      gap: 4,
    },
    itemPressed: {
      backgroundColor: colors.surfaceSecondary,
    },
    itemName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    itemDate: {
      fontSize: 12,
      color: colors.textSubtle,
    },
    empty: {
      marginTop: 24,
      textAlign: 'center',
      fontSize: 14,
      color: colors.textSubtle,
    },
    footnote: {
      marginTop: 8,
      textAlign: 'center',
      fontSize: 12,
      color: colors.placeholder,
    },
  });
