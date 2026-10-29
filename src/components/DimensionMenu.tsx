import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { DimensionAxis } from '@/types/shapes';

const MODES: { axis: DimensionAxis; label: string }[] = [
  { axis: 'aligned', label: 'Параллельный' },
  { axis: 'x', label: 'По X' },
  { axis: 'y', label: 'По Y' },
];

type Props = {
  axis: DimensionAxis;
  onSelectAxis: (axis: DimensionAxis) => void;
};

/** Подменю инструмента «Размер»: какой размер строить. */
export function DimensionMenu({ axis, onSelectAxis }: Props) {
  return (
    <View style={styles.panel}>
      {MODES.map(({ axis: a, label }) => {
        const active = a === axis;
        return (
          <Pressable
            key={a}
            onPress={() => onSelectAxis(a)}
            style={({ pressed }) => [
              styles.button,
              active && styles.buttonActive,
              pressed && !active && styles.buttonPressed,
            ]}>
            <Text style={[styles.buttonText, active && styles.buttonTextActive]}>{label}</Text>
          </Pressable>
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
});
