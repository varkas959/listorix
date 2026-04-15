Add-Type -AssemblyName System.Drawing
$files = @('android-icon-foreground', 'android-icon-background', 'android-icon-monochrome', 'icon', 'splash-icon')
foreach ($f in $files) {
    $p = "C:\GroListApp\assets\$f.png"
    if (Test-Path $p) {
        $img = [System.Drawing.Image]::FromFile($p)
        $bmp = New-Object System.Drawing.Bitmap($img)
        $img.Dispose()
        $bmp.Save($p, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        Write-Host "Converted $f.png to proper PNG"
    }
}
Write-Host "Done!"
