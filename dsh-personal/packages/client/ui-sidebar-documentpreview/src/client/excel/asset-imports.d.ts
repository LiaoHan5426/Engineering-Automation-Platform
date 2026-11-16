/** Build-owned parser Worker source embedded in the lazy Excel chunk. */
declare module '*.ts?raw' {
  const source: string
  export default source
}
