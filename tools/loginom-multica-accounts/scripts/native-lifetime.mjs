// Installed in an OWN, disconnected page before its one login. Never used on
// the owner's existing Admin tab. No payloads, GUID or credentials in traces.
export function installNativeLifetime() {
  const app = globalThis.bg?.app?.Application?.FInstance;
  const constructor = globalThis.bg?.app?.ServerConnection;
  if (!app || app.FServerConnection !== null || typeof constructor !== 'function'
    || globalThis.__lab53NativeLifetime) throw Error('NATIVE_LIFETIME_NOT_INSTALLABLE');
  const proto = constructor.prototype, events = [], actors = new WeakMap(), wrappers = [], connectors = new WeakSet();
  let connected = false, disposed = false, own;
  const event = (kind, name) => events.push({kind, name, at: new Date().toISOString()});
  const requireShape = (object, name) => {
    if (typeof object?.[name] !== 'function') throw Error('NATIVE_LIFETIME_SHAPE_UNCONFIRMED:' + name);
  };
  const wrap = (object, name, reject = false) => {
    requireShape(object, name);
    const original = object[name];
    const wrapped = function (...args) {
      event('call', name);
      if (reject || (connected && !disposed && ['DoConnect', 'ConnectToServer'].includes(name))) {
        event('forbidden', name); throw Error('NATIVE_RECONNECT_FORBIDDEN');
      }
      try {
        const result = Reflect.apply(original, this, args);
        if (result?.then) return result.catch(error => {event('error', name); throw error;});
        return result;
      } catch (error) {event('error', name); throw error;}
    };
    Object.defineProperty(object, name, {value: wrapped, writable: false, configurable: false});
    wrappers.push({object, name, wrapped});
  };
  for (const name of ['DoConnect', 'PrepareSession', 'Reconnect']) wrap(proto, name, name === 'Reconnect');
  // Retained DoConnect/OnTransportError/Reconnect all write FConnected. A saved
  // original Reconnect therefore cannot hide its state transition. Saved top
  // Reconnect also calls the guarded exact remote-container method below.
  for (const name of ['FConnected', 'FServerContainer', 'FRemoteServerContainer', 'FRemoteSession', 'FSession']) {
    if (Object.getOwnPropertyDescriptor(proto, name)) throw Error('NATIVE_LIFETIME_SHAPE_UNCONFIRMED:' + name);
    Object.defineProperty(proto, name, {configurable: false, get() {return actors.get(this)?.[name];}, set(value) {
      let state = actors.get(this);
      if (!state) {state = {}; actors.set(this, state); if (own && own !== this) event('forbidden', 'extra-connection'); else own = this;}
      if (connected && !disposed) event('forbidden', name);
      event('set', name); state[name] = value;
      if (name === 'FRemoteServerContainer' && value && !state.guardedContainer) {
        state.guardedContainer = value;
        wrap(value, 'Reconnect', true);
        wrap(value, 'ConnectToServer');
        wrap(value, 'Finalize');
        for (const field of ['FServerConnector', 'FServer']) {
          const initial = value[field];
          const existing = Object.getOwnPropertyDescriptor(value, field);
          if (existing && !existing.configurable) throw Error('NATIVE_LIFETIME_SHAPE_UNCONFIRMED:' + field);
          let held = initial;
          Object.defineProperty(value, field, {configurable: false, get() {return held;}, set(next) {
            event('set', field);
            if (connected && !disposed) event('forbidden', field);
            held = next;
            if (field === 'FServerConnector' && next && !connectors.has(next)) {
              connectors.add(next);
              let callback = next.OnTransportError;
              let holder = next, descriptor;
              while (holder && !(descriptor = Object.getOwnPropertyDescriptor(holder, 'OnTransportError'))) holder = Object.getPrototypeOf(holder);
              if (descriptor && ('get' in descriptor || 'set' in descriptor) && (!descriptor.get || !descriptor.set))
                throw Error('NATIVE_LIFETIME_SHAPE_UNCONFIRMED:connector-error');
              Object.defineProperty(next, 'OnTransportError', {configurable: false,
                get() {return descriptor?.get ? Reflect.apply(descriptor.get, this, []) : callback;}, set(fn) {
                event('set', 'connector-error-callback');
                if (connected && !disposed) event('forbidden', 'connector-error-callback');
                if (typeof fn !== 'function' && !disposed) throw Error('NATIVE_LIFETIME_SHAPE_UNCONFIRMED:connector-error');
                callback = typeof fn === 'function' ? function (...args) {
                  event('error', 'connector-error'); return Reflect.apply(fn, this, args);
                } : fn;
                if (descriptor?.set) Reflect.apply(descriptor.set, this, [callback]);
              }});
            }
          }});
        }
        // The retained CustomServerContainer setter propagates this callback
        // to its connector. Preserve its native behavior and observe errors.
        let holder = value, descriptor;
        while (holder && !(descriptor = Object.getOwnPropertyDescriptor(holder, 'OnTransportError'))) holder = Object.getPrototypeOf(holder);
        if (!descriptor?.set || !descriptor.get) throw Error('NATIVE_LIFETIME_SHAPE_UNCONFIRMED:OnTransportError');
        Object.defineProperty(value, 'OnTransportError', {configurable: false,
          get() {return Reflect.apply(descriptor.get, this, []);}, set(callback) {
            event('set', 'OnTransportError');
            if (connected && !disposed) event('forbidden', 'callback-replacement');
            if (typeof callback !== 'function' && !disposed) throw Error('NATIVE_LIFETIME_SHAPE_UNCONFIRMED:callback');
            const observed = typeof callback === 'function' ? function (...args) {
              event('error', 'OnTransportError'); return Reflect.apply(callback, this, args);
            } : callback;
            return Reflect.apply(descriptor.set, this, [observed]);
          }});
      }
    }});
  }
  const snapshot = () => {
    if (wrappers.some(item => item.object[item.name] !== item.wrapped)) event('forbidden', 'method-replacement');
    if (!own || app.FServerConnection !== own || !own.Connected || events.some(e => ['forbidden', 'error'].includes(e.kind)))
      throw Error('NATIVE_LIFETIME_UNKNOWN');
    return {events: [...events], connected, disposed, source_route: 'ServerConnection+CustomServerContainer',
      do_connect_count: events.filter(e => e.kind === 'call' && e.name === 'DoConnect').length,
      connect_to_server_count: events.filter(e => e.kind === 'call' && e.name === 'ConnectToServer').length,
      reconnect_count: events.filter(e => e.kind === 'call' && e.name === 'Reconnect').length};
  };
  const audit = Object.freeze({positive() {
    const result = snapshot();
    if (result.do_connect_count !== 1 || result.connect_to_server_count !== 1 || result.reconnect_count !== 0
      || !own.FRemoteServerContainer || !own.FRemoteSession || !own.FSession) throw Error('NATIVE_LIFETIME_UNKNOWN');
    connected = true; return snapshot();
  }, snapshot, beginLogout() {snapshot(); disposed = true; event('logout', 'begin');}});
  Object.defineProperty(globalThis, '__lab53NativeLifetime', {value: audit, configurable: false, writable: false});
  return {installed: true, route: 'ServerConnection+CustomServerContainer', before_login: true};
}

export async function nativePositive(page) {return page.evaluate(() => globalThis.__lab53NativeLifetime.positive());}
export async function nativeSnapshot(page) {return page.evaluate(() => globalThis.__lab53NativeLifetime.snapshot());}
