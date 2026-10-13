import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import type { CliProgramItem, TaskStatistics } from "@eap/runtime-client";

/** Browser QA only: ephemeral API fixtures, no process execution or database writes. */
function fixtures(): Plugin {
  const stats: TaskStatistics = {windowDays:7,tasksTotal:0,tasksInWindow:0,observationsInWindow:0,byStatus:{},byDecision:{},model:{recordedRuns:0,calls:0,share:null},deterministicShare:null,source:"browser-qa-fixture",note:"隔离内存样本"};
  const channel = (binary: string) => ({ binary, source: "shipped", resolvedPath: `/test/bin/${binary}` });
  const programs: CliProgramItem[] = [
    { id: "git", name: "Git", binary: "git", builtin: true, channel: channel("git"), operations: [
      { capabilityId: "git-status", programId: "git", title: "读取 Git 状态", args: ["status"], description: "只读查看工作区", builtin: true },
      { capabilityId: "git-diff", programId: "git", title: "读取 Git 差异", args: ["diff", "--stat"], description: "只读查看改动范围", builtin: true },
    ] },
    { id: "rg", name: "ripgrep", binary: "rg", builtin: true, channel: channel("rg"), operations: [
      { capabilityId: "rg-search", programId: "rg", title: "工作空间检索", args: ["--line-number", "--hidden"], description: "有界检索", builtin: true },
    ] },
  ];
  const enabled = new Map<string, boolean>();
  const notes = new Map<string, string>();
  const kinds = [
    {id:"command",label:"内置命令",scope:"platform",scopeLabel:"平台级",expertScoped:false},
    {id:"cli",label:"本地 CLI",scope:"platform",scopeLabel:"平台级",expertScoped:false},
    {id:"mcp",label:"MCP 工具",scope:"expert",scopeLabel:"专家级",expertScoped:true},
  ];
  const management = {id:"registry",label:"管理",description:"登记程序、管理固定参数操作",creation:"Git 操作已经预置，无需自行声明",manageable:true};
  return { name:"eap-qa-fixtures", configureServer(server) {
    server.middlewares.use(async (req,res,next) => {
      const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
      if (!pathname.startsWith("/api/")) return next();
      const bodyParts: Uint8Array[] = [];
      for await (const chunk of req) bodyParts.push(chunk);
      const payload = bodyParts.length ? JSON.parse(Buffer.concat(bodyParts).toString()) : {};
      let result: unknown = {};
      const items = programs.flatMap(program => program.operations.map(operation => ({
        name:operation.capabilityId, kind:"cli",kindLabel:"本地 CLI",scope:"platform",scopeLabel:"平台级",expertScoped:false,
        registered:true,title:operation.title,summary:operation.description,inputs:[],grants:[],executor:"ProcessExecutor",binary:program.binary,
        facts:[],evidence:["stdout/stderr"],readOnly:false,enabled:enabled.get(operation.capabilityId) ?? true,disabled:enabled.get(operation.capabilityId) === false,
        notes:notes.get(operation.capabilityId) ?? "",availability:enabled.get(operation.capabilityId) === false ? "disabled" : "available",availabilityLabel:enabled.get(operation.capabilityId) === false ? "已停用" : "可用",globallyRunnable:true,
        usedBy:[],declaredBy:[],authorisedExperts:[],management,programId:program.id,builtin:operation.builtin,args:operation.args,
      })));
      if (pathname === "/api/health") result = {status:"ok",service:"browser-qa-fixture"};
      else if (pathname === "/api/capabilities") result = {items,kinds:kinds.map(kind=>({...kind,count:kind.id==="cli"?items.length:0,description:"浏览器测试样本",management,manageable:true,visible:true,availability:{available:kind.id==="cli"?items.length:0}})),capabilities:items.map(item=>item.name),globallyUsable:items.map(item=>item.name),disabledPlatform:[],expertScoped:[],platformScoped:items.map(item=>item.name),expertScopedVocabulary:[],mcpServers:[],settings:{},disabledCapabilities:[],declared:items.map(item=>item.name),unregistered:[],undeclared:[],cliPrograms:programs};
      else if (pathname === "/api/cli-programs" && req.method === "GET") result = {items:programs};
      else if (pathname === "/api/cli-programs" && req.method === "POST") {programs.push({...payload,builtin:false,channel:channel(payload.binary),operations:[]});result={saved:true};}
      else if (/\/cli-programs\/[^/]+\/operations\/[^/]+$/.test(pathname)) {
        const [,programId,operationId] = pathname.match(/cli-programs\/([^/]+)\/operations\/([^/]+)$/) ?? [];
        const program=programs.find(p=>p.id===programId);
        if(program && req.method === "POST") program.operations.push({...payload,programId,capabilityId:decodeURIComponent(operationId ?? ""),builtin:false});
        result={saved:true};
      }
      else if (/\/capabilities\/[^/]+\/activation$/.test(pathname)) { const id = decodeURIComponent(pathname.split("/")[3] ?? ""); enabled.set(id,payload.enabled);notes.set(id,payload.notes ?? "");result={saved:true}; }
      else if (pathname === "/api/experts") result = {items:[],states:{}};
      else if (pathname === "/api/stats") result = stats;
      else result = {items:[]};
      res.setHeader("Content-Type","application/json; charset=utf-8");
      res.end(JSON.stringify(result));
    });
  }};
}
export default defineConfig({
  plugins: [vue(), fixtures()],
  define: {"import.meta.env.VITE_API_URL": JSON.stringify("/api")},
  server: {host:"127.0.0.1",port:5187,strictPort:true},
});
