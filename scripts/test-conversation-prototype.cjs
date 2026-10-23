// Local-only, dependency-free browser regression for the self-contained prototype.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'eap-chat-qa-'));
  const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const child = spawn(chrome, ['--headless', '--disable-gpu', '--no-first-run',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank']);
  let socket;
  try {
    const port = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Chrome startup timeout')), 15000);
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.stderr.on('data', data => {
        output += data;
        const match = output.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/);
        if (match) { clearTimeout(timer); resolve(Number(match[1])); }
      });
    });
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let seq = 0;
    const pending = new Map();
    const errors = [];
    socket.onmessage = event => {
      const data = JSON.parse(event.data);
      if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text);
      const entry = pending.get(data.id);
      if (entry) { pending.delete(data.id); data.error ? entry.reject(data.error) : entry.resolve(data.result); }
    };
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
    });
    await call('Runtime.enable');
    await call('Page.enable');
    await call('Emulation.setDeviceMetricsOverride', { width:1440, height:1000, deviceScaleFactor:1, mobile:false });
    await call('Page.navigate', { url:pathToFileURL(path.resolve(__dirname, '../docs/prototype/console.html')).href + '#chat' });
    const evaluate = async expression => {
      const r = await call('Runtime.evaluate', { expression, returnByValue:true, awaitPromise:true });
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
      return r.result.value;
    };
    for (let i = 0; i < 100; i++) {
      if (await evaluate('document.readyState === "complete"')) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(await evaluate('currentView'), 'chat');
    assert.equal(await evaluate('activeConversation().kind'), 'plain');
    await evaluate('prepareConversationAnalysis()');
    assert.match(await evaluate('document.getElementById("conversationFeedback").textContent'), /普通聊天不能/);
    await evaluate('document.getElementById("conversationInput").value="解释索引";sendConversationMessage({preventDefault(){}})');
    assert.equal(await evaluate('activeConversation().messages.length'), 2);
    await evaluate('newConversation("workspace");chooseConversationExpert("orders-sql")');
    assert.match(await evaluate('document.getElementById("conversationContext").textContent'), /orders-runbook/);
    await evaluate('document.getElementById("conversationInput").value="分析订单查询";sendConversationMessage({preventDefault(){}})');
    await evaluate('document.getElementById("conversationInput").value="补充：这是只读分析";sendConversationMessage({preventDefault(){}})');
    assert.equal(await evaluate('activeConversation().messages.length'), 4);
    await evaluate('currentWorkspace="other-workspace";prepareConversationAnalysis()');
    assert.match(await evaluate('document.getElementById("conversationFeedback").textContent'), /不一致/);
    assert.notEqual(await evaluate('activeConversation().workspace'), 'other-workspace');
    await evaluate('currentWorkspace=activeConversation().workspace;prepareConversationAnalysis()');
    assert.equal(await evaluate('currentView'), 'sql');
    assert.equal(await evaluate('document.getElementById("sqlText").value'), '');
    assert.equal(await evaluate('document.getElementById("requestModel").checked'), false);
    assert.match(await evaluate('document.getElementById("fld572").value'), /补充：这是只读分析/);
    await evaluate('runAnalysis()');
    assert.equal(await evaluate('activeConversation().links.length'), 1);
    await evaluate('new Promise(resolve => setTimeout(resolve, 500))');
    await evaluate('go("chat")');
    assert.match(await evaluate('document.getElementById("conversationHeading").textContent'), /查看演示执行/);
    await evaluate('prepareConversationAnalysis();committedExpert("orders-sql").enabled=false;runAnalysis()');
    assert.match(await evaluate('document.getElementById("sqlMessage").textContent'), /变化|过期/);
    await evaluate('committedExpert("orders-sql").enabled=true');
    await evaluate('go("chat")');
    assert.equal(await evaluate('document.body.classList.contains("inspector-open")'), false);
    for (const width of [1440, 1024, 760]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height:1000, deviceScaleFactor:1, mobile:false });
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'horizontal overflow at ' + width);
    }
    await call('Emulation.setDeviceMetricsOverride', { width:1440, height:1000, deviceScaleFactor:1, mobile:false });
    await evaluate('new Promise(resolve => setTimeout(resolve, 250))');
    const shot = await call('Page.captureScreenshot', { format:'png' });
    const imagePath = path.join(os.tmpdir(), 'eap-conversation-qa.png');
    fs.writeFileSync(imagePath, Buffer.from(shot.data, 'base64'));
    assert.deepEqual(errors, []);
    console.log('PASS: plain chat isolation, message append, expert scope, analysis handoff, execution linking, stale authorization.');
    console.log('Screenshot: ' + imagePath);
  } finally {
    socket?.close();
    child.kill();
    // Chrome may take a moment to release its temporary profile; never delete user profiles.
    await new Promise(resolve => setTimeout(resolve, 500));
    try { fs.rmSync(profile, { recursive:true, force:true, maxRetries:5, retryDelay:200 }); } catch { /* OS releases remaining temporary files later. */ }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
