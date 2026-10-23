param([string]$Directory,[string]$OutputDirectory,[string]$Check,[ValidateRange(1,60)][int]$TimeoutSeconds=15)
$ErrorActionPreference='Stop'
$encoding=[Text.UTF8Encoding]::new($false)
function WriteJson($path,$value){[IO.File]::WriteAllText($path,($value|ConvertTo-Json -Depth 5),$encoding)}
if($Check){
 try{
  $data=@();$source=''
  switch($Check){
   'token' {$source='whoami /groups';$g=(whoami /groups)-join "`n";if($g -notmatch 'S-1-16-8192'){throw 'Medium integrity required'};$data=@(@{integrity='Medium'})}
   'accounts' {$source='Get-LocalUser';$data=@(Get-LocalUser|Where-Object Name -match '^CodexSandbox'|Sort-Object Name|ForEach-Object {@{name=[string]$_.Name;sid=[string]$_.SID.Value;enabled=[bool]$_.Enabled}})}
   'group' {$source='Get-LocalGroupMember CodexSandboxUsers';$data=@(Get-LocalGroupMember CodexSandboxUsers|Sort-Object Name|ForEach-Object {@{name=[string]$_.Name;sid=[string]$_.SID.Value}})}
   'rules' {$source='Get-NetFirewallRule';$data=@(Get-NetFirewallRule -DisplayName 'codex_sandbox_offline*'|Sort-Object Name|ForEach-Object {@{id=[string]$_.Name;name=[string]$_.DisplayName;enabled=$_.Enabled.ToString();direction=$_.Direction.ToString();action=$_.Action.ToString()}})}
   'service' {$source='Win32_Service';$data=@(Get-CimInstance Win32_Service -Filter "Name='CodexSandboxService.OpenAI.Codex'"|ForEach-Object {@{name=[string]$_.Name;state=[string]$_.State;startMode=[string]$_.StartMode;identity=[string]$_.StartName;image=[string]$_.PathName}})}
   'helper' {$source='exact known helper, no directory enumeration';$p=Join-Path $env:USERPROFILE '.codex/.sandbox-bin/codex-command-runner-0.163.0-alpha.11.exe';$s=[IO.File]::OpenRead($p);$h=[Security.Cryptography.SHA256]::Create();try{$digest=[BitConverter]::ToString($h.ComputeHash($s)).Replace('-','')}finally{$s.Dispose();$h.Dispose()};$data=@(@{path=$p;sha256=$digest;length=(Get-Item -LiteralPath $p).Length})}
   'marker' {$source='setup_marker.json nonsecret DTO';$m=Get-Content -Raw (Join-Path $env:USERPROFILE '.codex/.sandbox/setup_marker.json')|ConvertFrom-Json;$data=@(@{version=[int]$m.version;offline=[string]$m.offline_username;online=[string]$m.online_username;readRoots=@($m.read_roots|ForEach-Object {[string]$_}|Sort-Object);writeRoots=@($m.write_roots|ForEach-Object {[string]$_}|Sort-Object)})}
   'acl' {$source='Directory.GetAccessControl, Owner/Group/Access only';foreach($p in @($Directory,(Split-Path $Directory -Parent))){$a=[IO.Directory]::GetAccessControl($p);$data+=@{path=[IO.Path]::GetFullPath($p);owner=$a.GetOwner([Security.Principal.SecurityIdentifier]).Value;protected=[bool]$a.AreAccessRulesProtected;sddl=$a.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]'Owner,Group,Access')}}}
   default {throw 'Unknown check'}
  }
  WriteJson (Join-Path $OutputDirectory "$Check.data.json") @{source=$source;data=@($data)}
  exit 0
 }catch{[Console]::Error.WriteLine($_.Exception.Message);exit 1}
}
if(!$OutputDirectory){$OutputDirectory=Join-Path (Split-Path $PSScriptRoot -Parent) ('backend/eap-runtime/target/sandbox-snapshots/snapshot-'+[guid]::NewGuid().ToString('N'))}
if(Test-Path $OutputDirectory){throw 'Use a fresh output directory'}
[IO.Directory]::CreateDirectory($OutputDirectory)|Out-Null
if(!$Directory){$Directory=Join-Path ([IO.Path]::GetTempPath()) ('eap-snapshot-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($Directory)|Out-Null}
WriteJson (Join-Path $OutputDirectory 'context.json') @{directory=$Directory;purpose='snapshot-only; no sandbox startup';timeoutSeconds=$TimeoutSeconds}
$results=@()
foreach($item in @('token','accounts','group','rules','service','helper','marker','acl')){
 $watch=[Diagnostics.Stopwatch]::StartNew();$status='failed';$errorText='';$cleanup='not_needed'
 $stdout=Join-Path $OutputDirectory "$item.stdout.log";$stderr=Join-Path $OutputDirectory "$item.stderr.log"
 try{
  $args=@('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$PSCommandPath+'"'),'-Check',$item,'-Directory',('"'+$Directory+'"'),'-OutputDirectory',('"'+$OutputDirectory+'"'))
  $p=Start-Process powershell.exe -ArgumentList $args -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  $handle=$p.Handle
  if(!$p.WaitForExit($TimeoutSeconds*1000)){
   $status='timeout';& taskkill /PID $p.Id /T /F | Out-Null;$cleanup=if($LASTEXITCODE -eq 0){'terminated_owned_tree'}else{'cleanup_failed'}
  }else{
   $p.WaitForExit();$p.Refresh()
   if($p.ExitCode -eq 0){$dto=Get-Content -Raw (Join-Path $OutputDirectory "$item.data.json")|ConvertFrom-Json;$status=if(@($dto.data).Count -eq 0){'empty'}else{'success'}}else{$errorText=Get-Content -Raw $stderr}
  }
 }catch{$errorText=$_.Exception.Message}
 $watch.Stop();$result=@{check=$item;status=$status;seconds=[math]::Round($watch.Elapsed.TotalSeconds,3);error=$errorText;cleanup=$cleanup;sourceFile="$item.data.json"}
 WriteJson (Join-Path $OutputDirectory "$item.result.json") $result
 $results+=,$result
 Write-Output "$item $status $($result.seconds)s"
 if($item -eq 'token' -and $status -ne 'success'){break}
}
$complete=$results.Count -eq 8 -and @($results|Where-Object {$_.status -ne 'success'}).Count -eq 0
WriteJson (Join-Path $OutputDirectory 'summary.json') @{complete=$complete;results=$results}
Write-Output "complete=$complete output=$OutputDirectory"
if(!$complete){exit 1}
