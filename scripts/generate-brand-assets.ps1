$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$branding = Join-Path $root 'public\media\branding'
$build = Join-Path $root 'build'
$logoPath = Join-Path $branding 'veto-protocol-logo.png'
New-Item -ItemType Directory -Force -Path $branding, $build | Out-Null

function Save-Bitmap($bitmap, $path, $format) {
  $bitmap.Save($path, $format)
  $bitmap.Dispose()
}

if (-not (Test-Path $logoPath)) {
  throw "Source logo not found: $logoPath"
}
$sourceLogo = [System.Drawing.Bitmap]::FromFile($logoPath)

function Draw-ContainedImage($graphics, $image, $bounds) {
  $scale = [Math]::Min($bounds.Width / $image.Width, $bounds.Height / $image.Height)
  $width = [int][Math]::Round($image.Width * $scale)
  $height = [int][Math]::Round($image.Height * $scale)
  $x = $bounds.X + [int](($bounds.Width - $width) / 2)
  $y = $bounds.Y + [int](($bounds.Height - $height) / 2)
  $graphics.DrawImage($image, $x, $y, $width, $height)
}

$icon = [System.Drawing.Bitmap]::new(512, 512)
$graphics = [System.Drawing.Graphics]::FromImage($icon)
$graphics.Clear([System.Drawing.Color]::FromArgb(255, 8, 9, 10))
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
Draw-ContainedImage $graphics $sourceLogo ([System.Drawing.Rectangle]::new(0, 0, 512, 512))
$graphics.Dispose()
$iconPath = Join-Path $build 'veto-protocol-icon.png'
Save-Bitmap $icon $iconPath ([System.Drawing.Imaging.ImageFormat]::Png)
Copy-Item $iconPath (Join-Path $branding 'veto-protocol-icon.png') -Force

$icoImage = [System.Drawing.Bitmap]::new(256, 256)
$icoGraphics = [System.Drawing.Graphics]::FromImage($icoImage)
$icoGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$icoGraphics.DrawImage([System.Drawing.Bitmap]::FromFile($iconPath), 0, 0, 256, 256)
$icoGraphics.Dispose()
$icoPngPath = Join-Path $build 'veto-protocol-icon-256.png'
Save-Bitmap $icoImage $icoPngPath ([System.Drawing.Imaging.ImageFormat]::Png)
$iconBytes = [System.IO.File]::ReadAllBytes($icoPngPath)
$stream = [System.IO.File]::Create((Join-Path $build 'veto-protocol.ico'))
$writer = [System.IO.BinaryWriter]::new($stream)
$writer.Write([UInt16]0); $writer.Write([UInt16]1); $writer.Write([UInt16]1)
$writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0)
$writer.Write([UInt16]1); $writer.Write([UInt16]32)
$writer.Write([UInt32]$iconBytes.Length); $writer.Write([UInt32]22)
$writer.Write($iconBytes)
$writer.Dispose(); $stream.Dispose()

$header = [System.Drawing.Bitmap]::new(150, 57)
$graphics = [System.Drawing.Graphics]::FromImage($header)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::FromArgb(255, 12, 13, 14))
$graphics.DrawLine([System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 222, 179, 73), 2), 0, 56, 150, 56)
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
Draw-ContainedImage $graphics $sourceLogo ([System.Drawing.Rectangle]::new(8, 4, 134, 48))
$graphics.Dispose()
Save-Bitmap $header (Join-Path $build 'installerHeader.bmp') ([System.Drawing.Imaging.ImageFormat]::Bmp)

$sidebar = [System.Drawing.Bitmap]::new(164, 314)
$graphics = [System.Drawing.Graphics]::FromImage($sidebar)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::FromArgb(255, 10, 11, 12))
$glow = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  [System.Drawing.Rectangle]::new(0, 170, 164, 144),
  [System.Drawing.Color]::FromArgb(150, 176, 115, 28),
  [System.Drawing.Color]::FromArgb(0, 10, 11, 12),
  [single]90
)
$graphics.FillRectangle($glow, 0, 170, 164, 144)
$graphics.DrawLine([System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 225, 185, 90), 2), 20, 26, 144, 26)
$font = [System.Drawing.Font]::new('Georgia', 14, [System.Drawing.FontStyle]::Bold)
$brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 248, 220, 148))
$graphics.DrawString('VETO', $font, $brush, 22, 38)
$font.Dispose()
$font = [System.Drawing.Font]::new('Georgia', 10, [System.Drawing.FontStyle]::Regular)
$graphics.DrawString('PROTOCOL', $font, $brush, 22, 62)
$font.Dispose()
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
Draw-ContainedImage $graphics $sourceLogo ([System.Drawing.Rectangle]::new(10, 105, 144, 72))
$font = [System.Drawing.Font]::new('Georgia', 7, [System.Drawing.FontStyle]::Regular)
$graphics.DrawString('MAP VETO COMPANION', $font, $brush, 15, 178)
$font.Dispose(); $brush.Dispose(); $glow.Dispose(); $graphics.Dispose()
Save-Bitmap $sidebar (Join-Path $build 'installerSidebar.bmp') ([System.Drawing.Imaging.ImageFormat]::Bmp)

$densitySizes = @{ mdpi=48; hdpi=72; xhdpi=96; xxhdpi=144; xxxhdpi=192 }
$foregroundSizes = @{ mdpi=108; hdpi=162; xhdpi=216; xxhdpi=324; xxxhdpi=432 }
foreach ($density in $densitySizes.Keys) {
  $size = $densitySizes[$density]
  $mipmap = Join-Path $root "android\app\src\main\res\mipmap-$density"
  $source = [System.Drawing.Bitmap]::FromFile($iconPath)
  foreach ($name in @('ic_launcher.png','ic_launcher_round.png')) {
    $scaled = [System.Drawing.Bitmap]::new($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($scaled)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($source, 0, 0, $size, $size)
    $g.Dispose()
    Save-Bitmap $scaled (Join-Path $mipmap $name) ([System.Drawing.Imaging.ImageFormat]::Png)
  }
  $source.Dispose()
  $foregroundSize = $foregroundSizes[$density]
  $foreground = [System.Drawing.Bitmap]::new($foregroundSize, $foregroundSize)
  $g = [System.Drawing.Graphics]::FromImage($foreground)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.Clear([System.Drawing.Color]::FromArgb(255, 8, 9, 10))
  Draw-ContainedImage $g $sourceLogo ([System.Drawing.Rectangle]::new(0, 0, $foregroundSize, $foregroundSize))
  $g.Dispose()
  Save-Bitmap $foreground (Join-Path $mipmap 'ic_launcher_foreground.png') ([System.Drawing.Imaging.ImageFormat]::Png)
}
$sourceLogo.Dispose()