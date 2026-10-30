import type { App, Plugin } from "vue";
import VxeUITable from "vxe-table";
import "vxe-table/lib/style.css";

export type { TableColumn, TableOverflow } from "./table/columns";
export { default as Table } from "./table/Table.vue";

/** Table-only install. Registers vxe-table, not vxe-pc-ui. */
export const tablePlugin: Plugin = {
  install(app: App) {
    app.use(VxeUITable as Plugin);
  },
};
