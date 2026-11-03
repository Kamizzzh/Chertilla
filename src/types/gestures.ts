import { Gesture } from 'react-native-gesture-handler';

/** Тип legacy Native-жеста, который связывает FlatList меню с жестами холста. */
export type SharedNativeGesture = ReturnType<typeof Gesture.Native>;
