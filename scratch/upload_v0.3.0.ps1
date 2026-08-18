$credInput = "protocol=https`nhost=github.com`n"
$output = $credInput | git credential fill
$token = ""
foreach ($line in $output) {
    if ($line.StartsWith("password=")) {
        $token = $line.Substring(9)
    }
}

if (-not $token) {
    Write-Error "GitHub token could not be retrieved from Git Credential Manager."
    exit 1
}

$env:GH_TOKEN = $token

Write-Host "Uploading latest binaries to Release v0.3.0..."
gh release upload v0.3.0 "release\Sparky AI Setup 0.3.0.exe" "release\Sparky AI 0.3.0.exe" --clobber

Write-Host "Updating release notes..."
gh release edit v0.3.0 --notes-file "scratch\release_notes_v0.3.0_en.md"

Write-Host "Done!"
