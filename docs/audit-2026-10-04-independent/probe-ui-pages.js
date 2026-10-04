async page=>{
 const base='http://127.0.0.1:3107';
 const dir='C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/screenshots';
 const results=[];
 for(const [w,h] of [[390,844],[768,1024],[1024,900],[1440,900]]){
  await page.setViewportSize({width:w,height:h});
  for(const theme of ['light','dark']){
   await page.goto(base+'/sign-in');await page.evaluate(t=>localStorage.setItem('campusforge-theme',t),theme);await page.emulateMedia({colorScheme:theme});
   for(const [name,path] of [['sign-in','/sign-in'],['sign-up','/sign-up'],['dashboard','/w/audit/dashboard'],['tasks','/audit?view=tasks'],['documents','/audit?view=documents']]){
    await page.goto(base+path);await page.waitForTimeout(150);
    await page.screenshot({path:`${dir}/${name}-${w}-${theme}.png`,animations:'disabled'});
    results.push({page:name,width:w,height:h,theme,...await page.evaluate(()=>({horizontalOverflow:document.documentElement.scrollWidth>innerWidth,scrollWidth:document.documentElement.scrollWidth,unnamedButtons:[...document.querySelectorAll('button')].filter(e=>e.getBoundingClientRect().width>0&&!e.textContent.trim()&&!e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby')).length}))});
   }
  }
 }
 await page.goto(base+'/audit?view=loading');await page.setViewportSize({width:390,height:844});await page.screenshot({path:dir+'/loading-skeletons-390.png',animations:'disabled'});
 await page.goto(base+'/audit?view=documents&state=empty');await page.screenshot({path:dir+'/documents-empty-390.png',animations:'disabled'});
 await page.getByRole('button',{name:'Upload First Document',exact:true}).click();
 await page.locator('input[type=file]').setInputFiles({name:'safe-empty.txt',mimeType:'text/plain',buffer:Buffer.from('')});
 await page.screenshot({path:dir+'/upload-validation-empty-error-390.png',animations:'disabled'});
 const emptyError=await page.getByText('File is empty.',{exact:true}).count();
 await page.locator('input[type=file]').setInputFiles({name:'safe-audit.txt',mimeType:'text/plain',buffer:Buffer.from('isolated audit only')});
 await page.getByRole('dialog').getByRole('button',{name:'Upload',exact:true}).click();
 await page.getByText('Audit mock upload failure',{exact:true}).waitFor();
 await page.screenshot({path:dir+'/upload-api-error-390.png',animations:'disabled'});
 return {results,uploadEmptyErrorDisplayed:emptyError,uploadApiErrorDisplayed:await page.getByText('Audit mock upload failure',{exact:true}).count()};
}
