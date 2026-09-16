ctx.prep=await ctx.prepare({operationId:'base-open',intent:'open_package',packagePath:'/test-3/N13-bafafea6.lgp'});
ctx.packagePath='/test-3/N13-'+ctx.session.metadata.sessionId.slice(0,8)+'.lgp';
await ctx.execute(`async page=>{await page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnPackagesMenu"]').click();await page.locator('[data-tid="MF;MainMenuForm;btnSaveAsPackage"]').click();await page.locator('[data-tid="SaveDialogForm;edtFileName"] input').fill(${JSON.stringify(ctx.packagePath)});await page.locator('[data-tid="SaveDialogForm;btnOpen"]').click();await page.locator('[data-tid="SaveDialogForm"]').waitFor({state:'hidden'});return true;}`);
await ctx.execute(`async page=>{await page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnPackagesMenu"]').click();await page.locator('[data-tid="MF;MainMenuForm;btnClosePackage"]').click();return true;}`);
ctx.prep=await ctx.prepare({operationId:'case-open',intent:'open_package',packagePath:ctx.packagePath});
if(ctx.prep.workflow_ref.navigation_path.some(p=>p.label.includes('только чтение')))throw Error('Diagnostic copy is read only');return ctx.prep;
