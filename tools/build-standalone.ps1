# Local packaging only: merges source/assets without executing game code or tests.
param([ValidateSet('all','desktop','mobile')][string]$Edition='all')
$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
$utf8=New-Object Text.UTF8Encoding($false)
$common=@('art.js','balance.js','statuses.js','progression.js','exploration.js','body.js','floor.js','game.js')
$modules=@{}
foreach($file in ($common+@('mobile.js'))){
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
    $modules[$file]=$content
}
$specs=@(
    @{name='desktop';source='index.html';target='余烬回廊.html';styles=@('style.css','forest-ui.css');scripts=$common},
    @{name='mobile';source='mobile.html';target='余烬回廊-手机版.html';styles=@('style.css','mobile.css','forest-ui.css');scripts=($common+@('mobile.js'))}
)
foreach($spec in $specs){
    if($Edition -ne 'all' -and $Edition -ne $spec.name){continue}
    $html=[IO.File]::ReadAllText((Join-Path $project ('dist\'+$spec.source)))
    foreach($style in $spec.styles){
        $tag='<link rel="stylesheet" href="'+$style+'">'
        if(-not $html.Contains($tag)){throw ('Expected stylesheet entry missing: '+$style)}
        $css=[IO.File]::ReadAllText((Join-Path $project ('dist\'+$style)))
        $html=$html.Replace($tag,"<style>"+[Environment]::NewLine+$css+[Environment]::NewLine+"</style>")
    }
    $tags=($spec.scripts|ForEach-Object {'<script src="'+$_+'"></script>'}) -join ''
    if(-not $html.Contains($tags)){throw ('Expected script entries missing: '+$spec.source)}
    $inline=New-Object Text.StringBuilder
    foreach($file in $spec.scripts){
        $null=$inline.Append('<script>').Append([Environment]::NewLine).Append($modules[$file]).Append([Environment]::NewLine).Append('</script>').Append([Environment]::NewLine)
    }
    $html=$html.Replace($tags,$inline.ToString())
    if($spec.name -eq 'mobile'){$html=$html.Replace('<a href="index.html" data-desktop-link>桌面版 ↗</a>','')}
    $output=Join-Path $project $spec.target
    [IO.File]::WriteAllText($output,$html,$utf8)
    [pscustomobject]@{edition=$spec.name;file=$output;bytes=(Get-Item -LiteralPath $output).Length}
}
