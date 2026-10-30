/** `ellipsis` clips to one line and shows the full text on hover. `wrap` keeps every line. */
export type TableOverflow = "ellipsis" | "wrap";

export type TableColumn = {
  key: string;
  title: string;
  width?: number | string;
  minWidth?: number | string;
  mono?: boolean;
  /** Overrides the table overflow. Defaults to the table setting, which is ellipsis. */
  overflow?: TableOverflow;
};
