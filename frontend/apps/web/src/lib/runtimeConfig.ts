/** Browser state is scoped by API destination; it never grants authority to that destination. */
export const apiStorageScope = encodeURIComponent(
  import.meta.env.VITE_API_SCOPE ?? import.meta.env.VITE_API_URL ?? '/api',
)
