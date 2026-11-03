import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo, useState, type ComponentProps } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ThemeColors } from '@/constants/theme';
import { APP_VERSION } from '@/constants/version';
import { useTheme } from '@/context/ThemeContext';
import type { ExportFormat } from '@/utils/shareExport';

/** Отступ служебных элементов от края безопасной зоны, пт. */
export const FLOATING_MARGIN = 12;
/** Отступ панели сверху (под вырезом камеры), пт. */
export const TOP_GAP = 6;

const TOP_BAR_CONTENT_HEIGHT = 52;
const MENU_WIDTH = 280;

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

type Props = {
  /** Название открытого проекта. */
  projectName: string;
  canUndo: boolean;
  canRedo: boolean;
  onBack: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onFeedback: () => void;
  /** Вызывается, только когда пользователь подтвердил загрузку. */
  onLoad: () => void;
  /** Вызывается с форматом, который пользователь выбрал в окне экспорта. */
  onExport: (format: ExportFormat) => void;
  onErrorLog: () => void;
  onSettings: () => void;
};

type MenuItem = {
  id: string;
  label: string;
  icon: IconName;
  onPress: () => void;
  disabled?: boolean;
  separatorBefore?: boolean;
};

/**
 * Чистая верхняя панель: «Назад», название с версией и «Гамбургер».
 * Все действия с чертежом собраны в выпадающем меню справа.
 */
export function TopBar({
  projectName,
  canUndo,
  canRedo,
  onBack,
  onUndo,
  onRedo,
  onSave,
  onFeedback,
  onLoad,
  onExport,
  onErrorLog,
  onSettings,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [menuVisible, setMenuVisible] = useState(false);

  // Загрузка заменяет весь чертёж, поэтому сначала спрашиваем подтверждение.
  const confirmLoad = () => {
    Alert.alert(
      'Загрузить сохранённый вариант?',
      'Чертёж вернётся к последнему сохранению. Несохранённые изменения будут потеряны.',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Загрузить', style: 'destructive', onPress: onLoad },
      ],
    );
  };

  // Выбор формата экспорта. В Android Alert не больше 3 кнопок — тут ровно 3.
  const chooseExportFormat = () => {
    Alert.alert('Экспорт чертежа', 'В каком формате сохранить файл?', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'SVG (для браузера)', onPress: () => onExport('svg') },
      { text: 'DXF (для CAD)', onPress: () => onExport('dxf') },
    ]);
  };

  const runMenuAction = (action: () => void) => {
    setMenuVisible(false);
    // Даём выпадающему окну закрыться перед открытием следующего модального окна.
    setTimeout(action, 0);
  };

  const items: MenuItem[] = [
    { id: 'save', label: 'Сохранить', icon: 'content-save-outline', onPress: onSave },
    { id: 'load', label: 'Загрузить', icon: 'folder-open-outline', onPress: confirmLoad },
    { id: 'export', label: 'Экспорт', icon: 'share-outline', onPress: chooseExportFormat },
    { id: 'undo', label: 'Отменить', icon: 'undo', onPress: onUndo, disabled: !canUndo },
    { id: 'redo', label: 'Вернуть', icon: 'redo', onPress: onRedo, disabled: !canRedo },
    {
      id: 'errors',
      label: 'Журнал ошибок',
      icon: 'alert-circle-outline',
      onPress: onErrorLog,
      separatorBefore: true,
    },
    {
      id: 'feedback',
      label: 'Сообщить об ошибке',
      icon: 'bug-outline',
      onPress: onFeedback,
    },
    { id: 'settings', label: 'Настройки', icon: 'cog-outline', onPress: onSettings },
  ];

  return (
    <>
      <View
        style={[
          styles.bar,
          {
            paddingTop: insets.top + TOP_GAP,
            paddingLeft: insets.left + FLOATING_MARGIN,
            paddingRight: insets.right + FLOATING_MARGIN,
          },
        ]}>
        <View style={styles.barContent}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Назад в меню"
            hitSlop={6}
            onPress={onBack}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}>
            <MaterialCommunityIcons name="arrow-left" size={25} color={colors.textSecondary} />
          </Pressable>

          <View style={styles.titleBlock}>
            <Text style={styles.projectName} numberOfLines={1}>
              {projectName}
            </Text>
            <Text style={styles.version}>v{APP_VERSION}</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Открыть меню проекта"
            accessibilityState={{ expanded: menuVisible }}
            hitSlop={6}
            onPress={() => setMenuVisible(true)}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}>
            <MaterialCommunityIcons name="menu" size={27} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setMenuVisible(false)}>
        <View style={styles.menuLayer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть меню проекта"
            style={StyleSheet.absoluteFill}
            onPress={() => setMenuVisible(false)}
          />
          <View
            style={[
              styles.menu,
              {
                top: insets.top + TOP_GAP + TOP_BAR_CONTENT_HEIGHT,
                right: insets.right + FLOATING_MARGIN,
              },
            ]}>
            <ScrollView
              style={styles.menuScroll}
              bounces={false}
              keyboardShouldPersistTaps="handled">
              {items.map((item) => (
                <View key={item.id}>
                  {item.separatorBefore && <View style={styles.menuSeparator} />}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                    accessibilityState={{ disabled: item.disabled ?? false }}
                    disabled={item.disabled}
                    onPress={() => runMenuAction(item.onPress)}
                    style={({ pressed }) => [
                      styles.menuItem,
                      pressed && !item.disabled && styles.menuItemPressed,
                      item.disabled && styles.menuItemDisabled,
                    ]}>
                    <MaterialCommunityIcons
                      name={item.icon}
                      size={22}
                      color={item.disabled ? colors.disabledText : colors.textSecondary}
                    />
                    <Text
                      style={[styles.menuItemText, item.disabled && styles.menuItemTextDisabled]}>
                      {item.label}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    bar: {
      paddingBottom: TOP_GAP,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
    },
    barContent: {
      minHeight: TOP_BAR_CONTENT_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
    },
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    iconButtonPressed: {
      backgroundColor: colors.surfaceSecondary,
    },
    titleBlock: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    projectName: {
      maxWidth: '100%',
      fontSize: 14,
      fontWeight: '700',
      textAlign: 'center',
      color: colors.text,
    },
    version: {
      marginTop: 2,
      fontSize: 11,
      color: colors.textSubtle,
    },
    menuLayer: {
      flex: 1,
      backgroundColor: colors.overlay,
    },
    menu: {
      position: 'absolute',
      width: MENU_WIDTH,
      maxHeight: '72%',
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      elevation: 12,
      shadowColor: colors.shadow,
      shadowOpacity: 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
    },
    menuScroll: {
      flexGrow: 0,
    },
    menuItem: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    menuItemPressed: {
      backgroundColor: colors.surfaceSecondary,
    },
    menuItemDisabled: {
      opacity: 0.55,
    },
    menuItemText: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    menuItemTextDisabled: {
      color: colors.disabledText,
    },
    menuSeparator: {
      height: 1,
      marginVertical: 4,
      backgroundColor: colors.borderSubtle,
    },
  });
