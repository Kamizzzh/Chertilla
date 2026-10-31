import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
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

import { parseNumber } from '@/utils/number';
import { roundMm, type Point } from '@/utils/viewport';

// На iOS в обычной цифровой клавиатуре нет минуса, а координаты бывают отрицательными.
const KEYBOARD_TYPE = Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric';

/**
 * Какие поля показывать:
 * 'xy' — только X и Y;
 * 'xyRadius' — X, Y и необязательный радиус (центр окружности: с радиусом окружность строится сразу);
 * 'radius' — только радиус (центр окружности уже задан);
 * 'segment' — X1, Y1 и X2, Y2 (изменение отрезка или прямоугольника);
 * 'circle' — X, Y и обязательный радиус (изменение окружности);
 * 'xyAngle' — X, Y и угол (изменение прямой);
 * 'arc' — X, Y центра, обязательный радиус, угол 1 и угол 2 (изменение дуги).
 */
export type CoordinateFields =
  | 'xy'
  | 'xyRadius'
  | 'radius'
  | 'segment'
  | 'circle'
  | 'xyAngle'
  | 'arc';

/** Что ввёл пользователь. Все значения уже округлены до 0.001 мм (угол — до 0.001°). */
export type CoordinateInput = {
  /** Точка (X, Y или X1, Y1). null — только в режиме 'radius', где полей X и Y нет. */
  p: Point | null;
  /** Вторая точка (X2, Y2). null — поля скрыты (есть только в режиме 'segment'). */
  p2: Point | null;
  /** Радиус (если вводили диаметр — уже пересчитан в радиус). null — поле пустое или скрыто. */
  radius: number | null;
  /** Угол (угол 1 у дуги) в градусах. null — поле скрыто (есть в режимах 'xyAngle' и 'arc'). */
  angle: number | null;
  /** Угол 2 дуги в градусах. null — поле скрыто (есть только в режиме 'arc'). */
  angle2: number | null;
};

/** Начальные значения полей — текущие параметры фигуры, которую изменяют. */
export type CoordinateInitial = {
  p?: Point;
  p2?: Point;
  radius?: number;
  angle?: number;
  angle2?: number;
};

type Props = {
  visible: boolean;
  /** Заголовок окна, например «Отрезок: конец». */
  title: string;
  /** Подсказка под заголовком (например, координаты первой точки). Можно не передавать. */
  hint?: string;
  fields: CoordinateFields;
  /**
   * Чем заполнить поля при открытии окна (изменение фигуры).
   * Не передали — в полях остаются значения с прошлого раза.
   */
  initial?: CoordinateInitial;
  /** Надпись на главной кнопке. По умолчанию «Построить». */
  submitLabel?: string;
  onCancel: () => void;
  /**
   * Пользователь нажал главную кнопку и ввёл корректные числа.
   * Вернуть null — всё хорошо (экран сам закроет окно или переключит его на следующую точку),
   * вернуть текст — это ошибка, окно останется открытым и покажет её красным.
   */
  onSubmit: (input: CoordinateInput) => string | null;
};

/** Тексты всех полей окна: X, Y, X2, Y2, радиус (или диаметр), угол, угол 2. */
type FieldTexts = {
  x: string;
  y: string;
  x2: string;
  y2: string;
  r: string;
  a: string;
  a2: string;
};
type FieldKey = keyof FieldTexts;

/** Числа из текстов полей. null — в поле не число. rBad — радиус введён неверно. */
function parseFields(t: FieldTexts, showRadius: boolean, radiusRequired: boolean) {
  const r = parseNumber(t.r);
  const rEmpty = t.r.trim() === '';
  return {
    x: parseNumber(t.x),
    y: parseNumber(t.y),
    x2: parseNumber(t.x2),
    y2: parseNumber(t.y2),
    r,
    a: parseNumber(t.a),
    a2: parseNumber(t.a2),
    // Радиус неверный: обязателен, но пуст, или введено не число / не больше нуля.
    rBad: showRadius && (rEmpty ? radiusRequired : r === null || r <= 0),
  };
}

/**
 * Всплывающее окно точного ввода: координаты X и Y (в мм), для окружности — радиус/диаметр,
 * а при изменении фигуры — также вторая точка отрезка / прямоугольника, угол прямой
 * или углы дуги.
 */
export function CoordinateModal({
  visible,
  title,
  hint,
  fields,
  initial,
  submitLabel = 'Построить',
  onCancel,
  onSubmit,
}: Props) {
  // Значения полей сохраняются между открытиями окна — удобно вводить соседние точки.
  const [xText, setXText] = useState('0');
  const [yText, setYText] = useState('0');
  const [x2Text, setX2Text] = useState('0');
  const [y2Text, setY2Text] = useState('0');
  // Радиус по умолчанию пустой: тогда окружность строится в два шага, как раньше.
  const [rText, setRText] = useState('');
  const [aText, setAText] = useState('0');
  const [a2Text, setA2Text] = useState('90');
  // false — в поле вводится радиус (R), true — диаметр (D).
  const [isDiameter, setIsDiameter] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Подсвечивать поля красным только после попытки построить, а не во время набора.
  const [triedSubmit, setTriedSubmit] = useState(false);

  // Последний набранный текст каждого поля. Пишется сразу при наборе, ещё до перерисовки:
  // если быстро нажать главную кнопку сразу после ввода, React может не успеть обновить
  // xText и остальные — тогда handleSubmit взял бы старые числа (в 0.0.0.0031 «Сохранить»
  // срабатывало только со второго раза). Поэтому handleSubmit берёт значения отсюда.
  // Очищается при каждом открытии окна (handleShow): к этому моменту состояние уже свежее.
  const typedRef = useRef<Partial<FieldTexts>>({});
  const setters: Record<FieldKey, (text: string) => void> = {
    x: setXText,
    y: setYText,
    x2: setX2Text,
    y2: setY2Text,
    r: setRText,
    a: setAText,
    a2: setA2Text,
  };
  const handleChangeText = (key: FieldKey, text: string) => {
    typedRef.current[key] = text;
    setters[key](text);
  };

  // Переключатель R/D: число в поле пересчитывается, чтобы размер окружности не менялся
  // (R 10 → D 20, D 20 → R 10). Пустое поле или не число не трогаем.
  const handleToggleDiameter = () => {
    const current = typedRef.current.r ?? rText;
    const value = parseNumber(current);
    if (value !== null) {
      // Округляем как введённое число; умножение и деление на 2 точность не теряют.
      const converted = isDiameter ? roundMm(value) / 2 : roundMm(value) * 2;
      handleChangeText('r', String(converted));
    }
    setIsDiameter(!isDiameter);
  };

  // Окно только что открыли — заполняем поля начальными значениями (если их передали).
  // Делаем это сразу во время отрисовки, а не после неё, чтобы старые числа не мелькнули.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible && initial) {
      if (initial.p) {
        setXText(String(initial.p.x));
        setYText(String(initial.p.y));
      }
      if (initial.p2) {
        setX2Text(String(initial.p2.x));
        setY2Text(String(initial.p2.y));
      }
      if (initial.radius !== undefined) {
        // Если переключатель стоит на диаметре — показываем диаметр.
        setRText(String(isDiameter ? roundMm(initial.radius * 2) : initial.radius));
      }
      if (initial.angle !== undefined) setAText(String(initial.angle));
      if (initial.angle2 !== undefined) setA2Text(String(initial.angle2));
    }
  }

  // Узлы TextInput, заполняются callback-ref'ами при монтировании (React вызывает их после
  // отрисовки — чтения ref во время рендера здесь нет).
  const inputNodes = useRef<Partial<Record<FieldKey, ComponentRef<typeof TextInput> | null>>>({});

  const showXY = fields !== 'radius';
  const showP2 = fields === 'segment';
  const showRadius =
    fields === 'xyRadius' || fields === 'radius' || fields === 'circle' || fields === 'arc';
  const radiusRequired = fields === 'radius' || fields === 'circle' || fields === 'arc';
  const showAngle = fields === 'xyAngle' || fields === 'arc';
  const showAngle2 = fields === 'arc';
  // У отрезка и прямоугольника две точки — подписи с номерами.
  const xLabel = showP2 ? 'X1' : 'X';
  const yLabel = showP2 ? 'Y1' : 'Y';
  // У дуги два угла — подписи с номерами.
  const angleLabel = showAngle2 ? '∠1' : '∠';
  const angleName = showAngle2 ? 'Угол 1' : 'Угол';

  // Числа из полей — для подсветки ошибок. Для кнопки handleSubmit считает их заново
  // по самым свежим текстам (typedRef).
  const { x, y, x2, y2, a, a2, rBad } = parseFields(
    { x: xText, y: yText, x2: x2Text, y2: y2Text, r: rText, a: aText, a2: a2Text },
    showRadius,
    radiusRequired,
  );

  const xInvalid = triedSubmit && showXY && x === null;
  const yInvalid = triedSubmit && showXY && y === null;
  const x2Invalid = triedSubmit && showP2 && x2 === null;
  const y2Invalid = triedSubmit && showP2 && y2 === null;
  const rInvalid = triedSubmit && rBad;
  const aInvalid = triedSubmit && showAngle && a === null;
  const a2Invalid = triedSubmit && showAngle2 && a2 === null;

  // Видимые поля по порядку: «Далее» на клавиатуре переводит курсор в следующее,
  // а в последнем поле «Готово» — то же самое, что главная кнопка.
  const order = useMemo<FieldKey[]>(() => {
    const list: FieldKey[] = [];
    if (showXY) list.push('x', 'y');
    if (showP2) list.push('x2', 'y2');
    if (showRadius) list.push('r');
    if (showAngle) list.push('a');
    if (showAngle2) list.push('a2');
    return list;
  }, [showXY, showP2, showRadius, showAngle, showAngle2]);

  // Окно появилось: сбрасываем старые ошибки и ставим курсор в первое поле.
  const handleShow = useCallback(() => {
    typedRef.current = {};
    setError(null);
    setTriedSubmit(false);
    const first = order[0];
    if (first) inputNodes.current[first]?.focus();
  }, [order]);

  // Окно осталось открытым, но сменился шаг (например, «Отрезок: начало» → «Отрезок: конец»):
  // готовим поля к вводу следующей точки так же, как при новом открытии.
  const prevTitleRef = useRef(title);
  useEffect(() => {
    if (visible && prevTitleRef.current !== title) handleShow();
    prevTitleRef.current = title;
  }, [visible, title, handleShow]);

  const handleCancel = () => {
    Keyboard.dismiss();
    onCancel();
  };

  const handleSubmit = () => {
    Keyboard.dismiss();
    setTriedSubmit(true);

    // Самые свежие тексты: то, что набрали после последней перерисовки, берём из typedRef.
    const latest: FieldTexts = {
      x: xText,
      y: yText,
      x2: x2Text,
      y2: y2Text,
      r: rText,
      a: aText,
      a2: a2Text,
      ...typedRef.current,
    };
    const { x, y, x2, y2, r, a, a2, rBad } = parseFields(latest, showRadius, radiusRequired);

    const missing = [
      showXY && x === null && xLabel,
      showXY && y === null && yLabel,
      showP2 && x2 === null && 'X2',
      showP2 && y2 === null && 'Y2',
      showAngle && a === null && angleName,
      showAngle2 && a2 === null && 'Угол 2',
    ].filter(Boolean);
    if (missing.length > 0) {
      setError(`Введите число в ${missing.length > 1 ? 'полях' : 'поле'} ${missing.join(', ')}`);
      return;
    }
    if (rBad) {
      setError(`${isDiameter ? 'Диаметр' : 'Радиус'} должен быть числом больше нуля`);
      return;
    }

    let radius: number | null = null;
    if (showRadius && r !== null) {
      // Диаметр округляем как введённое число, а радиус — его половина без потери точности.
      radius = isDiameter ? roundMm(r) / 2 : roundMm(r);
    }
    const p = showXY && x !== null && y !== null ? { x: roundMm(x), y: roundMm(y) } : null;
    const p2 = showP2 && x2 !== null && y2 !== null ? { x: roundMm(x2), y: roundMm(y2) } : null;
    const angle = showAngle && a !== null ? roundMm(a) : null;
    const angle2 = showAngle2 && a2 !== null ? roundMm(a2) : null;

    setError(onSubmit({ p, p2, radius, angle, angle2 }));
  };

  /** Поле ввода числа. Кнопка «Далее» / «Готово» на клавиатуре зависит от места поля в order. */
  const renderInput = (key: FieldKey, value: string, invalid: boolean, placeholder?: string) => {
    const index = order.indexOf(key);
    const next = order[index + 1];
    return (
      <TextInput
        ref={(node) => {
          inputNodes.current[key] = node;
        }}
        value={value}
        onChangeText={(text) => handleChangeText(key, text)}
        keyboardType={KEYBOARD_TYPE}
        returnKeyType={next ? 'next' : 'done'}
        onSubmitEditing={next ? () => inputNodes.current[next]?.focus() : handleSubmit}
        submitBehavior={next ? 'submit' : undefined}
        selectTextOnFocus
        placeholder={placeholder}
        placeholderTextColor="#B0BEC5"
        style={[styles.input, invalid && styles.inputInvalid]}
      />
    );
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
          <Text style={styles.title}>{title}</Text>
          {hint ? <Text style={styles.hint}>{hint}</Text> : null}

          {showXY && (
            <View style={styles.row}>
              <Text style={styles.label}>{xLabel}</Text>
              {renderInput('x', xText, xInvalid)}
              <Text style={styles.unit}>мм</Text>
            </View>
          )}

          {showXY && (
            <View style={styles.row}>
              <Text style={styles.label}>{yLabel}</Text>
              {renderInput('y', yText, yInvalid)}
              <Text style={styles.unit}>мм</Text>
            </View>
          )}

          {showP2 && (
            <View style={styles.row}>
              <Text style={styles.label}>X2</Text>
              {renderInput('x2', x2Text, x2Invalid)}
              <Text style={styles.unit}>мм</Text>
            </View>
          )}

          {showP2 && (
            <View style={styles.row}>
              <Text style={styles.label}>Y2</Text>
              {renderInput('y2', y2Text, y2Invalid)}
              <Text style={styles.unit}>мм</Text>
            </View>
          )}

          {showRadius && (
            <View style={styles.row}>
              {/* Нажатие на букву переключает, что вводится: радиус (R) или диаметр (D),
                  и пересчитывает число в поле. */}
              <Pressable
                onPress={handleToggleDiameter}
                hitSlop={6}
                style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}>
                <Text style={styles.toggleText}>{isDiameter ? 'D' : 'R'}</Text>
              </Pressable>
              {renderInput(
                'r',
                rText,
                rInvalid,
                radiusRequired ? undefined : 'необязательно',
              )}
              <Text style={styles.unit}>мм</Text>
            </View>
          )}

          {showRadius && (
            <Text style={styles.caption}>
              {isDiameter ? 'Вводится диаметр.' : 'Вводится радиус.'} Нажмите на букву{' '}
              {isDiameter ? 'D' : 'R'}, чтобы переключить.
              {radiusRequired ? '' : '\nЕсли оставить пустым — радиус задаётся следующим шагом.'}
            </Text>
          )}

          {showAngle && (
            <View style={styles.row}>
              <Text style={styles.label}>{angleLabel}</Text>
              {renderInput('a', aText, aInvalid)}
              <Text style={styles.unit}>°</Text>
            </View>
          )}

          {showAngle2 && (
            <View style={styles.row}>
              <Text style={styles.label}>∠2</Text>
              {renderInput('a2', a2Text, a2Invalid)}
              <Text style={styles.unit}>°</Text>
            </View>
          )}

          {showAngle && (
            <Text style={styles.caption}>
              {showAngle2
                ? 'Углы от оси X против часовой стрелки. Дуга идёт против часовой от угла 1 к углу 2.'
                : 'Угол от оси X против часовой стрелки.'}
            </Text>
          )}

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
              <Text style={[styles.buttonText, styles.buttonTextPrimary]}>{submitLabel}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Ширина подписи слева от поля: одинаковая для X, Y и кнопки R/D, чтобы поля стояли ровно.
const LABEL_WIDTH = 36;

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
  hint: {
    marginTop: -6,
    fontSize: 13,
    color: '#78909C',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    width: LABEL_WIDTH,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: '#37474F',
  },
  toggle: {
    width: LABEL_WIDTH,
    height: LABEL_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
    backgroundColor: '#E3F2FD',
    borderWidth: 1,
    borderColor: '#1E88E5',
  },
  togglePressed: {
    backgroundColor: '#BBDEFB',
  },
  toggleText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1565C0',
  },
  input: {
    flex: 1,
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
  unit: {
    // Одинаковая ширина для «мм» и «°», чтобы поля были одной длины.
    width: 24,
    fontSize: 14,
    color: '#78909C',
  },
  caption: {
    marginTop: -4,
    fontSize: 12,
    color: '#90A4AE',
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
