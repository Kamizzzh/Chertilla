import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { XLineMode } from '@/types/shapes';

const MODES: { mode: XLineMode; label: string }[] = [
  { mode: 'axisX', label: 'Ось X' },
  { mode: 'axisY', label: 'Ось Y' },
  { mode: 'angle', label: 'Свой угол' },
  { mode: 'twoPoints', label: '2 точки' },
];

type Props = {
  mode: XLineMode;
  onSelectMode: (mode: XLineMode) => void;
  /** Текст из поля ввода угла (в градусах), как его набрал пользователь. */
  angleText: string;
  onChangeAngleText: (text: string) => void;
  /** true — в поле угла не число, поле подсвечивается красным. */
  angleInvalid: boolean;
};

/** Подменю инструмента «Прямая»: выбор способа построения. */
export function XLineMenu({ mode, onSelectMode, angleText, onChangeAngleText, angleInvalid }: Props) {
  return (
    <View style={styles.panel}>
      {MODES.map(({ mode: m, label }) => {
        const active = m === mode;
        return (
          <View key={m} style={styles.item}>
            <Pressable
              onPress={() => onSelectMode(m)}
              style={({ pressed }) => [
                styles.button,
                active && styles.buttonActive,
                pressed && !active && styles.buttonPressed,
              ]}>
              <Text style={[styles.buttonText, active && styles.buttonTextActive]}>{label}</Text>
            </Pressable>

            {m === 'angle' && active && (
              <TextInput
                value={angleText}
                onChangeText={onChangeAngleText}
                placeholder="°"
                // На iOS в обычной цифровой клавиатуре нет минуса.
                keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
                returnKeyType="done"
                selectTextOnFocus
                style={[styles.input, angleInvalid && styles.inputInvalid]}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  button: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CFD8DC',
  },
  buttonPressed: {
    backgroundColor: '#ECEFF1',
  },
  buttonActive: {
    backgroundColor: '#546E7A',
    borderColor: '#546E7A',
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#37474F',
  },
  buttonTextActive: {
    color: '#FFFFFF',
  },
  input: {
    width: 64,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#90A4AE',
    fontSize: 14,
    color: '#212121',
  },
  inputInvalid: {
    borderColor: '#E53935',
    backgroundColor: '#FFEBEE',
  },
});
