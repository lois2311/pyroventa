// Doble mínimo del query builder de supabase-js para tests del router.
// Cada from() registra filtros; al hacer await se pregunta al resolver.

const FILTERS = ['eq', 'in', 'gte', 'lt', 'lte', 'neq']
const WRITES  = ['insert', 'update', 'delete', 'upsert']

export function createFakeSupabase(resolver) {
  const calls = []

  function from(table) {
    const q = { table, op: 'select', filters: [], single: false, payload: undefined }
    calls.push(q)
    const chain = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') {
          return (resolve, reject) => Promise.resolve().then(() => resolver(q)).then(resolve, reject)
        }
        return (...args) => {
          if (FILTERS.includes(prop)) q.filters.push([prop, ...args])
          else if (WRITES.includes(prop)) { q.op = prop; q.payload = args[0] }
          else if (prop === 'single' || prop === 'maybeSingle') q.single = true
          return chain
        }
      },
    })
    return chain
  }

  function rpc(fn, params) {
    const q = { rpc: fn, params }
    calls.push(q)
    return Promise.resolve().then(() => resolver(q))
  }

  return { from, rpc, calls }
}

/** Valor del primer filtro `method` sobre `col`, o undefined. */
export const filterValue = (q, method, col) => q.filters.find(f => f[0] === method && f[1] === col)?.[2]
