import { Link, Meta } from "@solidjs/meta"

export const Favicon = () => {
  return (
    <>
      <Link rel="icon" type="image/png" href="/loginom-favicon-32-v1.png" sizes="32x32" />
      <Link rel="icon" type="image/svg+xml" href="/loginom-favicon-v1.svg" sizes="any" />
      <Link rel="shortcut icon" href="/loginom-favicon-v1.ico" />
      <Link rel="apple-touch-icon" sizes="180x180" href="/loginom-apple-touch-v1.png" />
      <Link rel="manifest" href="/loginom-app-v1.webmanifest" />
      <Meta name="apple-mobile-web-app-title" content="Loginom AI" />
    </>
  )
}
