param([ValidateSet('before','run','after')][string]$Phase)
$ErrorActionPreference='Stop'
$out=Join-Path (Split-Path $PSScriptRoot -Parent) 'backend/eap-runtime/target/sandbox-preflight-once'
[IO.Directory]::CreateDirectory($out)|Out-Null
function Save($name,$value){[IO.File]::WriteAllText((Join-Path $out $name),($value|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))}
if($Phase -eq 'before'){
 if(Test-Path (Join-Path $out 'context.json')){throw 'Existing context: do not repeat'}
 $groups=whoami /groups
 if(($groups -join ' ') -notmatch 'S-1-16-8192'){throw 'Medium token required'}
 $cli=(Get-Command codex).Source
 if((& $cli --version) -notmatch '0.163.0-alpha.11.2'){throw 'Unexpected CLI'}
 $dir=Join-Path ([IO.Path]::GetTempPath()) ('eap-native-preflight-'+[guid]::NewGuid().ToString('N'))
 [IO.Directory]::CreateDirectory($dir)|Out-Null
 Save 'context.json' @{cli=$cli;directory=$dir;token='Medium'}
}
$ctx=Get-Content -Raw (Join-Path $out 'context.json')|ConvertFrom-Json
if($Phase -eq 'run'){
 [IO.File]::WriteAllText((Join-Path $out 'attempt.lock'),'one attempt',[Text.UTF8Encoding]::new($false))
 $argv=@('-c','sandbox_mode=workspace-write','-c','sandbox_workspace_write.network_access=false','sandbox','--cd',$ctx.directory,'--','cmd.exe','/d','/c','exit','0')
 $clock=[Diagnostics.Stopwatch]::StartNew()
 $p=Start-Process -FilePath $ctx.cli -ArgumentList $argv -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $out 'stdout.log') -RedirectStandardError (Join-Path $out 'stderr.log')
 $handle=$p.Handle
 $done=$p.WaitForExit(10000)
 if(!$done){& taskkill /PID $p.Id /T /F|Out-Null}else{$p.WaitForExit();$p.Refresh()}
 $clock.Stop()
 Save 'execution.json' @{pid=$p.Id;argv=$argv;elapsedSeconds=$clock.Elapsed.TotalSeconds;timedOut=(!$done);exitCode=$(if($done){$p.ExitCode}else{124})}
 exit
}
$dirs=@($ctx.directory,(Split-Path $ctx.directory -Parent),'C:/Users/LH/.codex/.sandbox','C:/Users/LH/.codex/.sandbox-bin')
$acls=@();foreach($d in $dirs){$a=[IO.Directory]::GetAccessControl($d);$acls+=@{path=$d;sddl=$a.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::All)}}
$hashes=@();foreach($f in (Get-ChildItem C:/Users/LH/.codex/.sandbox-bin -File)){
 $h=[Security.Cryptography.SHA256]::Create();$s=[IO.File]::OpenRead($f.FullName);try{$digest=[BitConverter]::ToString($h.ComputeHash($s))}finally{$s.Dispose();$h.Dispose()};$hashes+=@{name=$f.Name;hash=$digest}
}
$marker=Get-Content -Raw C:/Users/LH/.codex/.sandbox/setup_marker.json
Save "$Phase.json" @{users=@(Get-LocalUser|Where-Object Name -match 'CodexSandbox'|Select-Object Name,Enabled,SID);members=@(Get-LocalGroupMember CodexSandboxUsers|Select-Object Name,SID);rules=@(Get-NetFirewallRule -DisplayName 'codex_sandbox_offline*'|Select-Object Name,DisplayName,Enabled,Direction,Action);service=@(Get-CimInstance Win32_Service -Filter "Name='CodexSandboxService.OpenAI.Codex'"|Select-Object Name,State,StartMode,StartName,PathName);acls=$acls;helpers=$hashes;marker=$marker;processes=@(Get-CimInstance Win32_Process|Where-Object Name -match 'codex.*sandbox|codex-command-runner'|Select-Object ProcessId,ParentProcessId,Name)}
Write-Output "$Phase snapshot saved"
