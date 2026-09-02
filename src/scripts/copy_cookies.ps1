$src = "$env:LOCALAPPDATA\Google\Chrome\User Data\Profile 5\Network\Cookies"
$dst = "d:\estudos\tradelog\data\playwright_profile\Default\Network\Cookies"

$dstDir = [System.IO.Path]::GetDirectoryName($dst)
if (-not (Test-Path $dstDir)) {
    New-Item -ItemType Directory -Force -Path $dstDir | Out-Null
}

try {
    $srcStream = [System.IO.File]::Open($src, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    $dstStream = [System.IO.File]::Create($dst)
    $srcStream.CopyTo($dstStream)
    $srcStream.Close()
    $dstStream.Close()
    Write-Host "COPIED_COOKIES_SUCCESS: $((Get-Item $dst).Length) bytes"
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}
