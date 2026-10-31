export interface TreeNode {
  id: string;
  label: string;
  /** An empty array represents an unloaded/empty branch; omit for a leaf. */
  children?: TreeNode[];
  disabled?: boolean;
  testId?: string;
}
