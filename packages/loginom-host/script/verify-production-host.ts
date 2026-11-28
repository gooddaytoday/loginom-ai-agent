export async function verifyProductionHost(bundle: string) {
  if ((await Bun.file(bundle).text()).includes("con08-fault")) throw Error("RELEASE_CON08_FIXTURE_PRESENT")
}
