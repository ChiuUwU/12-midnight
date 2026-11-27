'use strict';
// Real Chrome smoke check; no project dependencies or user browser profile needed.
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const chrome=process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if(!fs.existsSync(chrome)) throw new Error('Set CHROME_PATH to an installed Chromium browser.');
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'werewolf-browser-'));
  const port=crypto.randomInt(20000,25000), debug=crypto.randomInt(25001,30000);
  const server=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1'},stdio:'ignore',windowsHide:true});
  const browser=spawn(chrome,['--headless=new','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,`--remote-debugging-port=${debug}`,'about:blank'],{stdio:'ignore',windowsHide:true});
  let socket;
  try {
    let target;
    for(let i=0;i<80;i++) {
      try { if((await fetch(`http://127.0.0.1:${port}`)).ok) {const tabs=await(await fetch(`http://127.0.0.1:${debug}/json/list`)).json();target=tabs.find(t=>t.type==='page');if(target)break;} }catch{}
      await sleep(100);
    }
    assert.ok(target,'Chrome or local server failed to start');
    socket=new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
    let id=0;const pending=new Map(), errors=[];
    socket.onmessage=event=>{
      const msg=JSON.parse(event.data);
      if(msg.id){const call=pending.get(msg.id);pending.delete(msg.id);if(call)msg.error?call.reject(msg.error):call.resolve(msg.result);}
      if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.text);
    };
    const call=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;const timeout=setTimeout(()=>{pending.delete(key);reject(new Error('CDP command timed out: '+method));},10000);pending.set(key,{resolve:value=>{clearTimeout(timeout);resolve(value);},reject:error=>{clearTimeout(timeout);reject(error);}});socket.send(JSON.stringify({id:key,method,params}));});
    await call('Runtime.enable'); await call('Page.enable');
    await call('Page.addScriptToEvaluateOnNewDocument',{source:`window.__spoken=[]; window.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}}; Object.defineProperty(window,'speechSynthesis',{value:{cancel(){},speak(u){window.__spoken.push(u.text);setTimeout(()=>u.onend?.(),20);}}});`});
    await call('Page.navigate',{url:`http://127.0.0.1:${port}`});
    let text='';
    for(let i=0;i<50;i++){await sleep(100);const r=await call('Runtime.evaluate',{expression:'document.body.innerText',returnByValue:true});text=r.result.value||'';if(text.includes('创建房间'))break;}
    assert.ok(text.includes('创建房间'),text);
    async function evaluate(expression) {const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
    async function waitFor(expression) {for(let i=0;i<60;i++){if(await evaluate(expression))return;await sleep(100);}throw new Error('Browser condition timed out: '+expression);}
    await evaluate(`document.querySelector('[data-view="create"]').click()`);
    await evaluate(`document.querySelector('[data-mode="SYSTEM"]').click(); document.querySelector('[data-action="create-room"]').click()`);
    await waitFor(`Boolean(document.querySelector('[data-action="fill-test-seats"]'))`);
    await evaluate(`document.querySelector('[data-action="fill-test-seats"]').click()`);
    await waitFor(`document.body.innerText.includes('12 / 12')`);
    await evaluate(`document.querySelector('[data-action="deal"]').click()`);
    await waitFor(`Boolean(document.querySelector('[data-action="start-night"]'))`);
    await evaluate(`document.querySelector('[data-action="start-night"]').click()`);
    await waitFor(`window.__spoken.some(text=>text.includes('混血儿'))`);
    await waitFor(`JSON.parse(localStorage.getItem('twelve_midnight_web_state_v1')).remoteRoom?.systemNight?.timing?.phase==='ACTION'`);
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await evaluate(`document.querySelector('[data-action="view"][data-view="room"]').click()`);
    await waitFor(`Boolean(document.querySelector('[data-action="open-rulebook"]'))`);
    await evaluate(`document.querySelector('[data-action="open-rulebook"]').click()`);
    await waitFor(`Boolean(document.querySelector('#rulebook-rules'))`);
    await evaluate(`window.scrollTo(0,document.documentElement.scrollHeight)`);
    await sleep(100);
    const toolbar=await evaluate(`({top:document.querySelector('.rulebook-toolbar').getBoundingClientRect().top,overflow:document.documentElement.scrollWidth>window.innerWidth})`);
    assert.ok(toolbar.top>=0 && toolbar.top<2,JSON.stringify(toolbar));
    assert.equal(toolbar.overflow,false,'rulebook must not overflow the page horizontally');
    await evaluate(`window.scrollTo(0,0)`);
    await sleep(100);
    const screenshot=await call('Page.captureScreenshot',{format:'png'});
    const preview=path.join(__dirname,`../analysis-output/rulebook-preview-${Date.now()}.png`);
    fs.mkdirSync(path.dirname(preview),{recursive:true});fs.writeFileSync(preview,Buffer.from(screenshot.data,'base64'));
    await evaluate(`document.querySelector('.rulebook-toolbar [data-action="rulebook-back"]').click()`);
    await waitFor(`document.body.innerText.includes('房间 ') && !document.querySelector('.rulebook-toolbar')`);
    assert.deepEqual(errors,[]);
    console.log('PASS real Chrome creates system room, fills seats, deals and starts fixed night; mocked speech acknowledgement reaches ACTION without uncaught exceptions');
    console.log('Browser temporary profile retained:',profile);
    console.log('PASS 390px rulebook sticky back, horizontal overflow and return-to-room checks; preview:',preview);
  } finally {socket?.close();browser.kill();server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
