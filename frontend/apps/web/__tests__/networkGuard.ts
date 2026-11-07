import { Server, Socket } from 'node:net'

export function isTestOwnedNetworkTarget(
  host: string,
  port: number,
  ownedEndpoints: ReadonlySet<string>,
): boolean {
  // Literal endpoints only: DNS aliases and wildcard binds never expand a grant.
  return ['127.0.0.1', '::1'].includes(host) && ownedEndpoints.has(`${host}:${port}`)
}

/** Worker-local socket guard includes Axios, fetch and happy-dom XHR. */
export function installTestNetworkGuard(): void {
  if (typeof XMLHttpRequest !== 'undefined') {
    const xhrInstalled = Symbol.for('eap.test.syncXhrGuard')
    if (!Object.prototype.hasOwnProperty.call(XMLHttpRequest.prototype, xhrInstalled)) {
      Object.defineProperty(XMLHttpRequest.prototype, xhrInstalled, { value: true })
      const open = XMLHttpRequest.prototype.open
      XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: unknown[]) {
        // happy-dom implements synchronous XHR through an unguarded Node child process.
        if (args[2] === false) throw new Error('EAP_TEST_SYNC_XHR_BLOCKED')
        return Reflect.apply(open, this, args)
      } as typeof open
    }
  }
  const installed = Symbol.for('eap.test.networkGuard')
  if (Object.prototype.hasOwnProperty.call(Socket.prototype, installed)) return
  Object.defineProperty(Socket.prototype, installed, { value: true })
  const ownedEndpoints = new Set<string>()
  const listen = Server.prototype.listen
  Server.prototype.listen = function (this: Server, ...args: unknown[]) {
    this.prependOnceListener('listening', () => {
      const address = this.address()
      if (!address || typeof address === 'string') return
      const endpoint = `${address.address}:${address.port}`
      ownedEndpoints.add(endpoint)
      this.once('close', () => ownedEndpoints.delete(endpoint))
    })
    return Reflect.apply(listen, this, args)
  } as typeof listen

  const connect = Socket.prototype.connect
  Socket.prototype.connect = function (this: Socket, ...args: unknown[]) {
    // Node may normalize connect arguments into [options, callback].
    const values = Array.isArray(args[0]) ? args[0] : args
    const first = values[0]
    const options =
      typeof first === 'object' && first !== null
        ? (first as { host?: string; port?: string | number })
        : { port: first, host: typeof values[1] === 'string' ? values[1] : undefined }
    const host = options.host ?? 'localhost'
    const port = Number(options.port)
    if (!isTestOwnedNetworkTarget(host, port, ownedEndpoints)) {
      const error = Object.assign(new Error(`EAP_TEST_NETWORK_BLOCKED: ${host}:${port}`), {
        code: 'EAP_TEST_NETWORK_BLOCKED',
      })
      queueMicrotask(() => this.destroy(error))
      return this
    }
    return Reflect.apply(connect, this, args)
  } as typeof connect
}
