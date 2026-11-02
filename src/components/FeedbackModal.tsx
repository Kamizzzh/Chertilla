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
import { MAX_FEEDBACK_LENGTH } from '@/utils/feedback';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** null — сообщение отправлено, строка — ошибка, которую нужно показать в окне. */
  onSubmit: (text: string) => Promise<string | null>;
};

/** Кастомное окно обратной связи для Android, iOS и web без Alert.prompt. */
export function FeedbackModal({ visible, onClose, onSubmit }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  // Свежий текст доступен даже при быстром нажатии «Отправить» сразу после ввода.
  const typedRef = useRef<string | null>(null);

  const handleShow = () => {
    typedRef.current = null;
    setText('');
    setError(null);
    setSending(false);
    inputRef.current?.focus();
  };

  const handleChangeText = (value: string) => {
    typedRef.current = value;
    setText(value);
    if (error) setError(null);
  };

  const handleClose = () => {
    if (sending) return;
    Keyboard.dismiss();
    onClose();
  };

  const handleSubmit = async () => {
    if (sending) return;
    const value = (typedRef.current ?? text).trim();
    if (!value) {
      setError('Опишите проблему или оставьте предложение');
      return;
    }

    Keyboard.dismiss();
    setSending(true);
    setError(null);
    try {
      const submitError = await onSubmit(value);
      if (submitError) {
        setError(submitError);
        return;
      }
      typedRef.current = '';
      setText('');
      onClose();
    } catch {
      setError('Не удалось отправить сообщение. Попробуйте ещё раз.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onShow={handleShow}
      onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.title}>Сообщить об ошибке</Text>
          <Text style={styles.hint}>
            Опишите, что произошло. Версия приложения, состояние проекта и последние 20 действий
            будут приложены автоматически.
          </Text>

          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={handleChangeText}
            placeholder="Что вы делали и что пошло не так?"
            placeholderTextColor={colors.placeholder}
            multiline
            numberOfLines={6}
            maxLength={MAX_FEEDBACK_LENGTH}
            editable={!sending}
            textAlignVertical="top"
            accessibilityLabel="Текст сообщения об ошибке"
            style={[styles.input, error !== null && styles.inputInvalid]}
          />
          <Text style={styles.counter}>
            {text.length} / {MAX_FEEDBACK_LENGTH}
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.buttons}>
            <Pressable
              onPress={handleClose}
              disabled={sending}
              style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
                sending && styles.buttonDisabled,
              ]}>
              <Text style={styles.buttonText}>Отмена</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={sending}
              accessibilityLabel="Отправить сообщение об ошибке"
              style={({ pressed }) => [
                styles.button,
                styles.buttonPrimary,
                pressed && styles.buttonPrimaryPressed,
                sending && styles.buttonDisabled,
              ]}>
              <Text style={[styles.buttonText, styles.buttonTextPrimary]}>
                {sending ? 'Отправка…' : 'Отправить'}
              </Text>
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
      maxWidth: 420,
      padding: 20,
      gap: 12,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    hint: {
      marginTop: -6,
      fontSize: 13,
      lineHeight: 18,
      color: colors.textMuted,
    },
    input: {
      minHeight: 140,
      maxHeight: 220,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      fontSize: 16,
      lineHeight: 22,
      color: colors.text,
    },
    inputInvalid: {
      borderColor: colors.danger,
    },
    counter: {
      marginTop: -8,
      alignSelf: 'flex-end',
      fontSize: 12,
      color: colors.textSubtle,
    },
    error: {
      fontSize: 13,
      lineHeight: 18,
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
    buttonDisabled: {
      opacity: 0.55,
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
