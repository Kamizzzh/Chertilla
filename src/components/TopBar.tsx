import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FLOATING_BUTTON_SIZE } from '@/components/FloatingButton';
import { APP_VERSION } from '@/constants/version';
import type { ExportFormat } from '@/utils/shareExport';

/** Отступ плавающих кнопок от края безопасной зоны, пт. */
export const FLOATING_MARGIN = 12;
/** Отступ панели и плавающих кнопок сверху (под вырезом камеры), пт. */
export const TOP_GAP = 6;

type Props = {
  /** Название открытого проекта. */
  projectName: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  /** Вызывается, только когда пользователь подтвердил загрузку. */
  onLoad: () => void;
  /** Вызывается с форматом, который пользователь выбрал в окне экспорта. */
  onExport: (format: ExportFormat) => void;
  /** Свернуть панель (останется только плавающая кнопка). */
  onCollapse: () => void;
};

type BarButtonProps = {
  label: string;
  disabled?: boolean;
  onPress: () => void;
};

/** Кнопка верхней панели. Неактивная — серая и не нажимается. */
function BarButton({ label, disabled = false, onPress }: BarButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}>
      <Text style={[styles.buttonText, disabled && styles.buttonTextDisabled]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Верхняя панель: название проекта и версия, сохранение/загрузка, экспорт,
 * кнопки истории действий и кнопка сворачивания.
 * Слева оставлено место под плавающую кнопку «Назад» (её рисует экран проекта).
 */
export function TopBar({
  projectName,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  onLoad,
  onExport,
  onCollapse,
}: Props) {
  const insets = useSafeAreaInsets();

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

  return (
    <View
      style={[
        styles.bar,
        {
          paddingTop: insets.top + TOP_GAP,
          // Слева — место под круглую кнопку «Назад» и небольшой зазор.
          paddingLeft: insets.left + FLOATING_MARGIN + FLOATING_BUTTON_SIZE + 10,
          paddingRight: insets.right + FLOATING_MARGIN,
        },
      ]}>
      <View style={styles.titleBlock}>
        <Text style={styles.projectName} numberOfLines={1}>
          {projectName}
        </Text>
        <Text style={styles.version}>v{APP_VERSION}</Text>
      </View>

      <View style={styles.buttons}>
        <BarButton label="💾 Сохранить" onPress={onSave} />
        <BarButton label="📂 Загрузить" onPress={confirmLoad} />
        <BarButton label="📤 Экспорт" onPress={chooseExportFormat} />
        <BarButton label="↶ Отменить" disabled={!canUndo} onPress={onUndo} />
        <BarButton label="↷ Вернуть" disabled={!canRedo} onPress={onRedo} />
        <BarButton label="▲" onPress={onCollapse} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 6,
    backgroundColor: '#F5F5F5',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  titleBlock: {
    // Длинное название сжимается и обрезается троеточием, не выталкивая кнопки.
    flexShrink: 1,
    minWidth: 60,
    // Высота не меньше круглой кнопки «Назад», чтобы та не вылезала за нижний край панели.
    minHeight: FLOATING_BUTTON_SIZE,
    justifyContent: 'center',
  },
  projectName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#263238',
  },
  version: {
    fontSize: 11,
    color: '#9E9E9E',
  },
  buttons: {
    flex: 1,
    flexDirection: 'row',
    // На узком экране кнопки переносятся на вторую строку, а не уезжают за край.
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
  },
  button: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CFD8DC',
  },
  buttonPressed: {
    backgroundColor: '#ECEFF1',
  },
  buttonDisabled: {
    backgroundColor: '#F5F5F5',
    borderColor: '#E0E0E0',
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#37474F',
  },
  buttonTextDisabled: {
    color: '#BDBDBD',
  },
});
