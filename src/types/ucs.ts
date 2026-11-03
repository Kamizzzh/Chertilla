export type UCS = {
  id: string;
  name: string;
  dx: number;
  dy: number;
  angle: number;
};

export type UcsAction = 'wcs' | 'create' | 'delete' | 'list';

/** originOnly — один тап по центру без поворота; xAxis — центр и направление оси X. */
export type UcsCreationMethod = 'originOnly' | 'xAxis';
