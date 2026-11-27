const labels = {thinking:'Думаю', working:'Работаю в Loginom', waiting:'Жду Loginom'}
const thresholds = {model:90, read:120, write:180}

export function duration(seconds) {
  return seconds < 60 ? `${seconds} с` : `${Math.floor(seconds / 60)} мин ${seconds % 60} с`
}

export function stepProgress(run, accelerated = false) {
  const now = Date.now()
  const age = start => Math.max(0, Math.floor((now - start) * (accelerated ? 32 : 1) / 1000))
  const seconds = age(run.stepStarted)
  return {
    seconds,
    text: [labels[run.signal], `Идёт ${duration(seconds)}`,
      run.lastReply && `Loginom ответил ${duration(age(run.lastReply))} назад`].filter(Boolean).join(' · '),
    stalled: age(run.waitedAt ?? run.stepStarted) >= thresholds[run.stepKind],
  }
}

export function refreshStepProgress(root, run, accelerated) {
  const clock = root.querySelector('[data-step-clock]')
  if (!clock) return
  const {text, stalled} = stepProgress(run, accelerated)
  if (clock.textContent !== text) clock.textContent = text
  const notice = root.querySelector('[data-step-stalled]')
  if (notice) notice.hidden = !stalled
}
