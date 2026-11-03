export type UCS = {
  id: string;
  name: string;
  dx: number;
  dy: number;
  angle: number;
};

export type UcsAction = 'wcs' | 'create' | 'delete' | 'list';
