return await ctx.execute(`async page=>await page.locator('[data-tid*="Workspace;t.br;tb-"]:visible').evaluateAll(es=>es.map(e=>({tid:e.getAttribute('data-tid'),text:e.textContent})))`);
