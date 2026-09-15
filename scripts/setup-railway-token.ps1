$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$secure = Read-Host 'Paste Railway API token for Mara (input hidden)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  $plain | & npm.cmd --prefix $repoRoot run railway:setup-token:stdin
} finally {
  if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  $plain = $null
}