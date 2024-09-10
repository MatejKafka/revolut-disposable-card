$Version = cat .\package.json | ConvertFrom-Json | % version

rm .\out -Recurse -Force -ErrorAction Ignore

# windows ARM64 is not supported by Bun
"linux-x64", "linux-arm64", "windows-x64", "darwin-x64", "darwin-arm64" | % {
    bun build . --compile --minify --target bun-$_-baseline --outfile out/revolut-v$Version-$_
}


# generate checksums
Get-FileHash out\* `
    | % {$_.Hash.ToLowerInvariant() + "  " + (Split-Path -Leaf $_.Path) + "`n"} `
    | Set-Content out\SHASUMS256.txt -NoNewline

