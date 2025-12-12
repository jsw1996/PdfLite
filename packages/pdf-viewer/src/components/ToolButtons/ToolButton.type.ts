export type GroupIndex = 0 | 1 | 2;

export interface IToolButton {
  /** Unique identifier for selection state (defaults to `name`). */
  id?: string;
  name: string;
  icon: React.ReactNode;
  type: 'button' | 'toggle' | 'dropdown';
  onClick?: () => void;
  isEnabled?: boolean;
  groupIndex: GroupIndex;
}
