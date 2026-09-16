import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'

const landingUrl = 'https://loginom-dock.duckdns.org/#install'

export const Route = createFileRoute('/connect')({ component: ConnectRoute })

function ConnectRoute() {
  useEffect(() => {
    window.location.replace(landingUrl)
  }, [])

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-8">
      <h1 className="text-3xl font-semibold">Подключение Loginom Dock</h1>
      <p>Инструкция по установке и работе с плагином открывается на отдельном сайте.</p>
      <a className="text-primary underline" href={landingUrl}>
        Перейти к установке Loginom Dock →
      </a>
    </div>
  )
}
