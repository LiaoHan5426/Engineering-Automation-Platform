export interface MenuAction {
  id: string;
  label: string;
  disabled?: boolean;
  destructive?: boolean;
  description?: string;
  testId?: string;
}
