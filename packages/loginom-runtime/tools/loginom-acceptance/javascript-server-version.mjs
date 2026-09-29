// Loginom MainForm.DoServerPrepare selects Session.Version.IsWindows from the
// server before opening HomePage. Re-read the same property through its
// selector, inside the owned logged-in session; never infer OS from Chromium.
export async function readJavascriptServerVersion({account,build}) {
  const bg=globalThis.bg,app=bg?.app,main=app?.Application?.FInstance?.FMainForm;
  const connection=main?.FMapTree?.FServerConnection,session=connection?.Session;
  const home=main?.Items?.Workspace?.getActiveTab?.()?.Controller?.Node?.data?.node;
  if(!connection||connection.Connected!==true||connection.UserName!==account||app?.Version!==build
    ||main.FMapTree.PackageNodes?.Count!==0||home?.constructor?.name!=='HomePageTreeNode'
    ||!session||typeof bg.selectAsyncValue!=='function'||typeof bg.select!=='function')
    return {status:'refused',reason:'owned_home_session_unconfirmed'};
  let version;
  await bg.selectAsyncValue(session,
    current=>[bg.select(current.Version,selected=>[selected.IsWindows,selected.PlatformEdition])],
    current=>{const selected=current.Version;version={is_windows:selected.IsWindows,edition:selected.PlatformEdition};});
  if(main!==app.Application.FInstance.FMainForm||connection!==main.FMapTree.FServerConnection
    ||connection.Connected!==true||connection.UserName!==account||main.FMapTree.PackageNodes?.Count!==0
    ||main.Items.Workspace.getActiveTab?.()?.Controller?.Node?.data?.node!==home)
    return {status:'refused',reason:'owned_home_session_changed'};
  if(typeof version?.is_windows!=='boolean'||typeof version.edition!=='string'||version.edition.length<1||version.edition.length>100)
    return {status:'refused',reason:'server_version_unconfirmed'};
  return {status:'observed',server_os:version.is_windows?'Windows':'Linux',is_windows:version.is_windows,edition:version.edition};
}
