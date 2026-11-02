import { useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { ThemeColors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { parseNumber } from '@/utils/number';

const MAX_SEGMENTS = 10000;

type Props = {
  visible: boolean;
  shapeName: string;
  onCancel: () => void;
  /** Вернуть текст ошибки, если разделить фигуру не удалось; null — закрыть окно. */
  onSubmit: (segments: number) => string | null;
};

/** Кастомное окно команды «Разделить»: целое число равных сегментов без Alert.prompt. */
export function DivideModal({ visible, shapeName, onCancel, onSubmit }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [text, setText] = useState('2');
  const [error, setError] = useState<string | null>(null);
  const [triedSubmit, setTriedSubmit] = useState(false);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  // Как и в CoordinateModal: свежий текст доступен даже при быстром нажатии кнопки.
  const typedRef = useRef<string | null>(null);

  const handleShow = () => {
    typedRef.current = null;
    setError(null);
    setTriedSubmit(false);
    inputRef.current?.focus();
  };

  const handleChangeText = (value: string) => {
    typedRef.current = value;
    setText(value);
  };

  const handleCancel = () => {
    Keyboard.dismiss();
    onCancel();
  };

  const handleSubmit = () => {
    Keyboard.dismiss();
    setTriedSubmit(true);
    const segments = parseNumber(typedRef.current ?? text);
    if (
      segments === null ||
      !Number.isInteger(segments) ||
      segments < 2 ||
      segments > MAX_SEGMENTS
    ) {
      setError(`Введите целое число от 2 до ${MAX_SEGMENTS}`);
      return;
    }
    setError(onSubmit(segments));
  };

  const value = parseNumber(text);
  const invalid =
    triedSubmit &&
    (value === null ||
      !Number.isInteger(value) ||
      value < 2 ||
      value > MAX_SEGMENTS);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onShow={handleShow}
      onRequestClose={handleCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.title}>Разделить: {shapeName}</Text>
          <Text style={styles.hint}>
            {shapeName === 'Окружность'
              ? 'На окружности появится N равномерно распределённых точек.'
              : 'Внутри фигуры появится N − 1 равномерно распределённых точек.'}
          </Text>

          <Text style={styles.label}>Количество сегментов (N)</Text>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={handleChangeText}
            keyboardType="number-pad"
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            selectTextOnFocus
            style={[styles.input, invalid && styles.inputInvalid]}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.buttons}>
            <Pressable
              onPress={handleCancel}
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
              <Text style={styles.buttonText}>Отмена</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              style={({ pressed }) => [
                styles.button,
                styles.buttonPrimary,
                pressed && styles.buttonPrimaryPressed,
              ]}>
              <Text style={[styles.buttonText, styles.buttonTextPrimary]}>Разделить</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
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
      maxWidth: 360,
      padding: 20,
      gap: 12,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    hint: {
      marginTop: -6,
      fontSize: 13,
      color: colors.textMuted,
    },
    label: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    input: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 6,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      fontSize: 16,
      color: colors.text,
    },
    inputInvalid: {
      borderColor: colors.danger,
      backgroundColor: colors.dangerSurface,
    },
    error: {
      fontSize: 13,
      color: colors.danger,
    },
    buttons: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
      marginTop: 4,
    },
    button: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.inputBorder,
    },
    buttonPressed: {
      backgroundColor: colors.surfacePressed,
    },
    buttonPrimary: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    buttonPrimaryPressed: {
      backgroundColor: colors.primaryPressed,
    },
    buttonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    buttonTextPrimary: {
      color: colors.onPrimary,
    },
  });
