import { useRef, useState, type ComponentRef } from 'react';
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

type Props = {
  visible: boolean;
  /** Название, которое подставляется в поле при открытии окна. */
  defaultName: string;
  onCancel: () => void;
  /** Пользователь нажал «Создать». Название уже без пробелов по краям и не пустое. */
  onSubmit: (name: string) => void;
};

/**
 * Окно ввода названия нового проекта.
 * Своё окно вместо Alert.prompt: Alert.prompt работает только на iOS.
 */
export function ProjectNameModal({ visible, defaultName, onCancel, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);

  // Окно появилось: подставляем название по умолчанию и ставим курсор в поле.
  const handleShow = () => {
    setName(defaultName);
    setError(null);
    inputRef.current?.focus();
  };

  const handleCancel = () => {
    Keyboard.dismiss();
    onCancel();
  };

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (trimmed === '') {
      setError('Введите название проекта');
      return;
    }
    Keyboard.dismiss();
    onSubmit(trimmed);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onShow={handleShow}
      // Кнопка «Назад» на Android работает как «Отмена».
      onRequestClose={handleCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.title}>Новый проект</Text>

          <TextInput
            ref={inputRef}
            value={name}
            onChangeText={setName}
            placeholder="Название проекта"
            placeholderTextColor="#B0BEC5"
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            selectTextOnFocus
            maxLength={60}
            style={[styles.input, error !== null && styles.inputInvalid]}
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
              <Text style={[styles.buttonText, styles.buttonTextPrimary]}>Создать</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    padding: 20,
    gap: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#263238',
  },
  input: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#90A4AE',
    fontSize: 16,
    color: '#212121',
  },
  inputInvalid: {
    borderColor: '#E53935',
    backgroundColor: '#FFEBEE',
  },
  error: {
    fontSize: 13,
    color: '#E53935',
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
    backgroundColor: '#ECEFF1',
    borderWidth: 1,
    borderColor: '#B0BEC5',
  },
  buttonPressed: {
    backgroundColor: '#CFD8DC',
  },
  buttonPrimary: {
    backgroundColor: '#546E7A',
    borderColor: '#546E7A',
  },
  buttonPrimaryPressed: {
    backgroundColor: '#455A64',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#37474F',
  },
  buttonTextPrimary: {
    color: '#FFFFFF',
  },
});
