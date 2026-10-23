param([string]$Name = 'versions', [int]$TimeoutSeconds = 60,
      [string]$LogDirectory, [switch]$KeepLogs)
$ErrorActionPreference = 'Stop'
$OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$root = Split-Path $PSScriptRoot -Parent
$logDir = if ($LogDirectory) { [IO.Path]::GetFullPath($LogDirectory) }
          else { Join-Path $root 'backend/eap-runtime/target/validation-logs' }
$commands = @{
 versions = 'java -version & mvn -version & node --version & pnpm --version & vp --version'
 node = 'node --version'
 pnpm = 'pnpm --version'
 backend = 'mvn -B -ntp -f backend/pom.xml test'
 single = 'mvn -B -ntp -f backend/pom.xml -pl eap-runtime -am -Dtest=CapabilityCatalogTest -Dsurefire.failIfNoSpecifiedTests=false test'
 process = 'mvn -B -ntp -f backend/pom.xml -pl eap-runtime -am -Dtest=DefaultProcessExecutorTest -Dsurefire.failIfNoSpecifiedTests=false test'
 typecheck = 'pnpm --dir frontend typecheck'
 test = 'pnpm --dir frontend test run'
 build = 'pnpm --dir frontend build'
 boundaries = 'pnpm --dir frontend check:boundaries'
}
if (!$commands.ContainsKey($Name)) { throw 'Unknown check' }
[IO.Directory]::CreateDirectory($logDir) | Out-Null
$runId = "$Name-$(Get-Date -Format yyyyMMdd-HHmmss-fff)"
$out = Join-Path $logDir "$runId.stdout.log"
$err = Join-Path $logDir "$runId.stderr.log"
$timer = [Diagnostics.Stopwatch]::StartNew()
$p = Start-Process -FilePath $env:ComSpec -ArgumentList @('/d','/s','/c', ('"' + $commands[$Name] + '"')) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
$handle = $p.Handle
$done = $p.WaitForExit($TimeoutSeconds * 1000)
if ($done) { $p.WaitForExit(); $p.Refresh() }
if (!$done) {
    & taskkill /PID $p.Id /T /F | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Timeout; cleanup denied for owned process $($p.Id). Use a normal host terminal to inspect and terminate that process tree." }
}
$timer.Stop()
$exitCode = if ($done) { $p.ExitCode } else { 124 }
$retain = $KeepLogs -or [bool]$LogDirectory -or !$done -or $exitCode -ne 0
$result = [ordered]@{name=$Name;command=$commands[$Name];timeoutSeconds=$TimeoutSeconds;elapsedSeconds=[math]::Round($timer.Elapsed.TotalSeconds,2);timedOut=(!$done);exitCode=$exitCode;logsRetained=[bool]$retain;stdout=$(if($retain){$out}else{$null});stderr=$(if($retain){$err}else{$null})}
if ($retain) {
    [IO.File]::WriteAllText((Join-Path $logDir "$runId.result.json"), ($result | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
}
$result | ConvertTo-Json
Get-Content $out -Tail 30
Get-Content $err -Tail 15
if (!$retain) {
    Remove-Item -LiteralPath $out,$err
}
exit $result.exitCode
