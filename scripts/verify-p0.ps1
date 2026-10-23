param([string]$Name = 'versions', [int]$TimeoutSeconds = 60)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$logDir = Join-Path $root 'docs/audits/p0-logs'
[IO.Directory]::CreateDirectory($logDir) | Out-Null
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
$out = Join-Path $logDir "$Name.stdout.log"
$err = Join-Path $logDir "$Name.stderr.log"
$timer = [Diagnostics.Stopwatch]::StartNew()
$p = Start-Process -FilePath $env:ComSpec -ArgumentList @('/d','/s','/c', ('"' + $commands[$Name] + '"')) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
$done = $p.WaitForExit($TimeoutSeconds * 1000)
if (!$done) { & taskkill /PID $p.Id /T /F | Out-Null }
$timer.Stop()
$result = [ordered]@{name=$Name;command=$commands[$Name];timeoutSeconds=$TimeoutSeconds;elapsedSeconds=[math]::Round($timer.Elapsed.TotalSeconds,2);timedOut=(!$done);exitCode= $(if($done){$p.ExitCode}else{124});stdout=$out;stderr=$err}
$result | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $logDir "$Name.result.json")
$result | ConvertTo-Json
Get-Content $out -Tail 30
Get-Content $err -Tail 15
