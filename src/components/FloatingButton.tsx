import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  /** Значок на кнопке (один символ). */
  icon: string;
  onPress: () => void;
  /** Положение кнопки на экране (top/left/right/bottom). */
  style?: StyleProp<ViewStyle>;
  /** Подпись для экранного диктора. */
  accessibilityLabel: string;
};

/** Размер круглой плавающей кнопки, пт. */
export const FLOATING_BUTTON_SIZE = 40;

/** Круглая кнопка, «парящая» над холстом (возврат в меню, разворот панели). */
export function FloatingButton({ icon, onPress, style, accessibilityLabel }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      // Кнопка небольшая, поэтому зона нажатия чуть шире её самой.
      hitSlop={6}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, style]}>
      <Text style={styles.icon}>{icon}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    width: FLOATING_BUTTON_SIZE,
    height: FLOATING_BUTTON_SIZE,
    borderRadius: FLOATING_BUTTON_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CFD8DC',
    // Тень, чтобы кнопка была заметна поверх чертежа.
    elevation: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  buttonPressed: {
    backgroundColor: '#ECEFF1',
  },
  icon: {
    fontSize: 20,
    fontWeight: '700',
    color: '#37474F',
  },
});
