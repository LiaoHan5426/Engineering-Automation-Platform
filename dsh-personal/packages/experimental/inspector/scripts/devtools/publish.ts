/** Publish a compiled directory after transient Windows filesystem handles settle. */
import { rename } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'

/**
 * Rename a completed build, retrying Windows sharing failures for at most 1.5 seconds.
 * @param source - Completed private build directory.
 * @param destination - Vacant published directory path.
 */
export async function publishDirectory(source: string, destination: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(source, destination)
      return
    } catch (error) {
      if (process.platform !== 'win32' || attempt === 5 || !(error instanceof Error)
        || !('code' in error) || (error.code !== 'EPERM' && error.code !== 'EBUSY')) throw error
      await setTimeout(100 * (attempt + 1))
    }
  }
}
