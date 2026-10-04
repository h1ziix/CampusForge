async page => {
  const base='http://127.0.0.1:3107';
  const dir='C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/screenshots';
  const results=[];
  await page.goto(base+'/audit');
  await page.evaluate(()=>localStorage.clear());
  for(const [width,height] of [[390,844],[768,1024],[1024,900],[1440,900]]) {
    for(const theme of ['light','dark']) {
      await page.setViewportSize({width,height});
      await page.emulateMedia({colorScheme:theme});
      await page.goto(base+'/sign-in');
      await page.evaluate(theme=>{localStorage.setItem('campusforge-theme',theme);localStorage.setItem('campusforge:assistant:v1',JSON.stringify({conversations:[],activeId:null,settings:{theme,model:'gpt-4.1',autoSave:true}}))},theme);
      await page.goto(base+'/audit');
      await page.getByRole('heading',{name:'How can I help you, Audit today?'}).waitFor();
      await page.waitForTimeout(550);
      await page.screenshot({path:`${dir}/assistant-new-${width}-${theme}.png`,animations:'disabled'});
      const metrics=await page.evaluate(()=>{
        const el=document.querySelector('textarea');const r=el.getBoundingClientRect();
        const visible=a=>{const x=a.getBoundingClientRect();return x.width>0&&x.height>0};
        return {composer:{top:r.top,bottom:r.bottom,height:r.height,withinViewport:r.top>=0&&r.bottom<=innerHeight},workspaceNavLinks:[...document.querySelectorAll('a')].filter(visible).map(x=>x.textContent.trim()),docScrollWidth:document.documentElement.scrollWidth,bodyScrollHeight:document.body.scrollHeight,theme:document.documentElement.classList.contains('dark')?'dark':'light'};
      });
      results.push({view:'assistant-new',width,height,theme,...metrics});
      await page.goto(base+'/sign-in');
      await page.evaluate(()=>{const state=JSON.parse(localStorage.getItem('campusforge:assistant:v1'));state.conversations=[{id:'audit-conversation',title:'Audit fixture conversation',model:'gpt-4.1',createdAt:Date.now(),updatedAt:Date.now(),messages:[{id:'audit-user-message',role:'user',content:'Audit evidence fixture',createdAt:Date.now()},{id:'audit-assistant-message',role:'assistant',content:'This response is an audit fixture. The original assistant implementation is a local mock engine.',model:'gpt-4.1',createdAt:Date.now()}]}];state.activeId='audit-conversation';localStorage.setItem('campusforge:assistant:v1',JSON.stringify(state))});
      await page.goto(base+'/audit');
      await page.getByText('Audit evidence fixture',{exact:true}).waitFor();
      await page.waitForTimeout(400);
      await page.screenshot({path:`${dir}/assistant-active-${width}-${theme}.png`,animations:'disabled'});
      results.push({view:'assistant-active',width,height,theme,...await page.evaluate(()=>{const r=document.querySelector('textarea').getBoundingClientRect();return {composer:{top:r.top,bottom:r.bottom,withinViewport:r.top>=0&&r.bottom<=innerHeight},docScrollWidth:document.documentElement.scrollWidth}})});
    }
  }
  return results;
}
