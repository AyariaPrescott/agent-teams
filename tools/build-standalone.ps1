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
        $assetPaths=@([regex]::Matches($content,"'assets/([^']+\.png)'") | ForEach-Object {$_.Groups[1].Value} | Sort-Object -Unique)
        if(-not $assetPaths.Count){throw 'No local image entries were found.'}
        foreach($name in $assetPaths){
            $imagePath=Join-Path $project ('dist\assets\'+$name)
            if(-not [IO.File]::Exists($imagePath)){throw ('Missing local image: '+$name)}
            $uri='data:image/png;base64,'+[Convert]::ToBase64String([IO.File]::ReadAllBytes($imagePath))
            $content=$content.Replace(('assets/'+$name),$uri)
        }
        if($content.Contains("'assets/")){throw 'A local image reference was left outside the standalone file.'}
    }
    $null=$inline.Append("<script>`n").Append($content).Append("`n</script>`n")
}
$html=$html.Replace($tags,$inline.ToString())
[IO.File]::WriteAllText((Join-Path $project '余烬回廊.html'),$html,$utf8)
