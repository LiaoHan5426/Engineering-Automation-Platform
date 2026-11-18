/** Execute the shipped spreadsheet factory and its real pinned assets, without a Host fixture. */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Frame, type Page } from "playwright";
import * as ts from "typescript";
import { afterAll, beforeAll, expect, it } from "vite-plus/test";

const require = createRequire(import.meta.url);
let browser: Browser;
let shipped: string;

beforeAll(async () => {
  const path = fileURLToPath(
    new URL(
      "../../../packages/client/ui-sidebar-documentpreview/lib/client.excel.js",
      import.meta.url,
    ),
  );
  const source = await readFile(path, "utf8");
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let insertion: number | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "Workbook") {
      let statement: ts.Node = node;
      while (!ts.isVariableStatement(statement)) {
        if (statement.parent === undefined) throw new Error("Workbook has no containing statement");
        statement = statement.parent;
      }
      insertion = statement.end;
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (insertion === undefined) throw new Error("Shipped spreadsheet Workbook was not found");
  // Expose the private component only. Keep the actual factory, engine assets, CSS, options and CSP.
  shipped =
    source.slice(0, insertion) + ";window.__AuditWorkbook=Workbook;" + source.slice(insertion);
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

interface Cell {
  v?: string | number;
  f?: string;
  bg?: string;
  bl?: number;
}
interface Selected {
  text: string;
  editable: string;
  markup: number;
  html: string;
  copiedText: string;
  copiedMarkup: number;
  rangeText: string;
  rangeMarkup: number;
  cell: Cell;
}

async function frame(page: Page, owner: number): Promise<Frame> {
  const element = await page.locator(`#book${owner} iframe`).elementHandle();
  const result = await element?.contentFrame();
  if (result == null) throw new Error(`Workbook ${owner} has no frame`);
  await result.waitForFunction("window.luckysheet?.getAllSheets()[0]?.data?.[0]?.[0]");
  return result;
}

it("keeps hostile text inert before HTML sinks while preserving native workbook behavior", async () => {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 1000 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  try {
    const page = await context.newPage();
    const failures: string[] = [];
    const requests: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") failures.push(message.text());
    });
    await page.route("**/*", (route) =>
      route.fulfill({ contentType: "text/html", body: '<!doctype html><div id="app"></div>' }),
    );
    await page.goto("http://127.0.0.1:7777/");
    page.on("request", (request) => requests.push(request.url()));
    await page.addScriptTag({ path: require.resolve("vue/dist/vue.global.prod.js") });
    await page.addScriptTag({
      content:
        "window.__previewCounter=0;window.__ModuleLoader__={load:entry=>entry.factory(spec=>{if(spec==='vue')return Vue;if(spec==='@deepseek-ai/dsh-client-ui-primitives')return {};throw Error('Unexpected external '+spec)})};",
    });
    await page.addScriptTag({ content: shipped });
    const payload =
      '<script>parent.__previewCounter++</script><img src="data:image/png;base64,AA" onerror="parent.__previewCounter++"><b data-preview-probe>MARK & literal</b>';
    const formula = '="' + payload.replaceAll('"', '""') + '"';
    await page.addScriptTag({
      content: `
      window.auditPayload=${JSON.stringify(payload)};
      window.auditSheets=[{name:'First',index:'one',status:1,order:0,row:20,column:10,
        calcChain:[{r:0,c:0,index:'one'},{r:2,c:0,index:'one'},{r:3,c:0,index:'one'}],
        celldata:[{r:0,c:0,v:{v:'cached result',m:'cached result',f:${JSON.stringify(formula)}}},
          {r:1,c:0,v:{v:auditPayload,m:auditPayload,ct:{fa:'General',t:'s'}}},
          {r:2,c:0,v:{v:auditPayload,m:auditPayload,f:'="cached"'}},
          {r:3,c:0,v:{v:99,m:'99',f:'=1+1',bg:'#ff0000',bl:1,mc:{r:3,c:0,rs:1,cs:2}}},
          {r:4,c:0,v:{f:'=SUM(1,2)',m:''}},
          {r:5,c:0,v:{v:auditPayload,m:auditPayload,ct:{t:'inlineStr',s:[{v:auditPayload,bl:1}]}}}],
        config:{merge:{'3_0':{r:3,c:0,rs:1,cs:2}}}},
        {name:'Second',index:'two',status:0,order:1,row:20,column:10,celldata:[{r:0,c:0,v:{v:'independent',m:'independent'}}],config:{}}];
      window.auditApps=[0,1].map(owner=>{const root=document.createElement('div');root.id='book'+owner;root.style='width:1000px;height:440px';document.querySelector('#app').append(root);const app=Vue.createApp({render:()=>Vue.h(__AuditWorkbook,{sheets:auditSheets,language:'en',label:'Book'+owner})});app.mount(root);return app});
    `,
    });
    const first = await frame(page, 0);
    const second = await frame(page, 1);
    await first.evaluate(
      "window.copies=[];const originalCopy=document.execCommand.bind(document);window.restoreCopy=()=>{document.execCommand=originalCopy};document.execCommand=(command,...args)=>{if(command.toLowerCase()==='copy'){copies.push(document.activeElement?.value);return true}return originalCopy(command,...args)};",
    );
    for (const [row, text, copied] of [
      [0, formula, "cached result"],
      [1, payload, payload],
      [2, '="cached"', payload],
      [3, "=1+1", "99"],
      [4, "=SUM(1,2)", ""],
      [5, payload, payload],
    ] as const) {
      await first.locator("#luckysheet-cell-main").click({ position: { x: 40, y: row * 20 + 10 } });
      await first.evaluate(`luckysheet.setRangeShow([{row:[${row},${row}],column:[0,0]}])`);
      await page.keyboard.press("Control+c");
      const selected = await first.evaluate<Selected>(`(() => {
        const bar=document.querySelector('#luckysheet-functionbox-cell');
        const copy=new DOMParser().parseFromString(copies.at(-1)||'','text/html');
        const range=new DOMParser().parseFromString(luckysheet.getRangeHtml(),'text/html');
        return {text:bar.textContent,editable:bar.getAttribute('contenteditable'),markup:bar.querySelectorAll('script,img,b,[data-preview-probe]').length,
          html:copies.at(-1),copiedText:copy.querySelector('td')?.textContent,copiedMarkup:copy.querySelectorAll('script,img,b,[data-preview-probe]').length,
          rangeText:range.querySelector('td')?.textContent,rangeMarkup:range.querySelectorAll('script,img,b,[data-preview-probe]').length,
          cell:luckysheet.getAllSheets()[0].data[${row}][0]};})()`);
      expect(selected.text).toBe(text);
      expect(selected.editable).toBe("false");
      expect(selected.markup).toBe(0);
      expect(selected.copiedText).toBe(copied);
      expect(selected.copiedMarkup).toBe(0);
      expect(selected.rangeText.trimEnd()).toBe(copied);
      expect(selected.rangeMarkup).toBe(0);
      if (row === 0) expect(selected.cell.f).toBe(formula);
      if (row === 3)
        expect(selected.cell).toMatchObject({ v: 99, f: "=1+1", bg: "#ff0000", bl: 1 });
      if (row === 4) expect(selected.cell.v).toBeUndefined();
      if (row === 1) expect(selected.html).toContain("&lt;script&gt;");
    }
    await first.evaluate("restoreCopy();luckysheet.setRangeShow([{row:[1,1],column:[0,0]}])");
    await first.locator("#luckysheet-cell-main").click({ position: { x: 40, y: 30 } });
    await page.keyboard.press("Control+c");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(payload + "\n");
    const clipboardHtml = await page.evaluate(async () => {
      const item = (await navigator.clipboard.read()).find((value) =>
        value.types.includes("text/html"),
      );
      if (item === undefined) throw new Error("Native grid copy omitted HTML");
      return (await item.getType("text/html")).text();
    });
    expect(clipboardHtml).toContain("&lt;script&gt;");
    expect(
      await page.evaluate(
        (html) =>
          new DOMParser().parseFromString(html, "text/html").querySelector("td")?.textContent,
        clipboardHtml,
      ),
    ).toBe(payload);
    const beforeTyping = await first.locator("#luckysheet-functionbox-cell").textContent();
    await first.locator("#luckysheet-functionbox-cell").click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("OVERRIDE");
    await page.keyboard.press("Enter");
    expect(await first.locator("#luckysheet-functionbox-cell").textContent()).toBe(beforeTyping);
    await first.evaluate(
      "const bar=document.querySelector('#luckysheet-functionbox-cell');const range=document.createRange();range.setStart(bar.firstChild,0);range.setEnd(bar.firstChild,7);getSelection().removeAllRanges();getSelection().addRange(range);",
    );
    await page.keyboard.press("Control+c");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(payload.slice(0, 7));
    expect(await first.evaluate<Cell>("luckysheet.getAllSheets()[0].data[3][0]")).toMatchObject({
      v: 99,
      f: "=1+1",
    });
    expect(await page.evaluate<number>("__previewCounter")).toBe(0);
    expect(await page.evaluate<string>("auditSheets[0].celldata[0].v.f")).toBe(formula);
    expect(
      await first.evaluate<number>('luckysheet.getAllSheets()[0].config.merge["3_0"].cs'),
    ).toBe(2);
    await first.locator("#luckysheet-sheets-itemtwo").click();
    await first.waitForFunction('String(luckysheet.getAllSheets()[1].status)==="1"');
    expect(
      await first.locator("#luckysheet-functionbox-cell").getAttribute("contenteditable"),
    ).toBe("false");
    expect(
      await second.evaluate<string>(
        'luckysheet.getAllSheets().find(sheet=>String(sheet.status)==="1").name',
      ),
    ).toBe("First");
    await page.evaluate("auditApps[0].unmount()");
    expect(await page.locator("#book0 iframe").count()).toBe(0);
    expect(await second.evaluate<Cell>("luckysheet.getAllSheets()[0].data[3][0]")).toMatchObject({
      v: 99,
      f: "=1+1",
    });
    await page.evaluate("auditApps[1].unmount()");
    expect(await page.locator("iframe").count()).toBe(0);
    expect(requests).toEqual([]);
    expect(failures).toEqual([]);
  } finally {
    await context.close();
  }
}, 30_000);
