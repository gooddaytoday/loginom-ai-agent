import { onState } from "./loginom.js"
window.states = []
onState(state => window.states.push(state))
window.late = () => {
  let first
  onState(state => { first ??= state })()
  return first
}
