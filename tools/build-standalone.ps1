# Deterministic local packaging only; does not execute game code or tests.
$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
$utf8=New-Object Text.UTF8Encoding($false)
$html=[IO.File]::ReadAllText((Join-Path $project 'dist\index.html'))
$css=[IO.File]::ReadAllText((Join-Path $project 'dist\style.css'))
$html=$html.Replace('<link rel="stylesheet" href="style.css">',"<style>`n"+$css+"`n</style>")
$tags='<script src="art.js"></script><script src="balance.js"></script><script src="body.js"></script><script src="floor.js"></script><script src="game.js"></script>'
if(-not $html.Contains($tags)){throw 'Expected local script entries were not found.'}
$inline=New-Object Text.StringBuilder
foreach($file in @('art.js','balance.js','body.js','floor.js','game.js')){
    $content=[IO.File]::ReadAllText((Join-Path $project ('dist\'+$file)))
    if($file -eq 'art.js'){
        foreach($image in Get-ChildItem -LiteralPath (Join-Path $project 'dist\assets') -File -Filter '*.png'){
            $uri='data:image/png;base64,'+[Convert]::ToBase64String([IO.File]::ReadAllBytes($image.FullName))
            $content=$content.Replace(('assets/'+$image.Name),$uri)
        }
    }
    $null=$inline.Append("<script>`n").Append($content).Append("`n</script>`n")
}
$html=$html.Replace($tags,$inline.ToString())
[IO.File]::WriteAllText((Join-Path $project '余烬回廊.html'),$html,$utf8)
