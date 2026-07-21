param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\frontend\public\icons')
)

Add-Type -AssemblyName System.Drawing

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

function New-AppIcon {
  param(
    [int]$Size,
    [string]$FileName
  )

  $scale = $Size / 512.0
  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#1a1a1a'))

  $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
  $red = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#e8474c'))
  $green = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#2eaf7d'))
  $ink = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#1a1a1a'))

  $graphics.FillRectangle($white, 64 * $scale, 64 * $scale, 384 * $scale, 384 * $scale)
  $graphics.FillRectangle($ink, 112 * $scale, 141 * $scale, 288 * $scale, 18 * $scale)
  $graphics.FillRectangle($ink, 112 * $scale, 353 * $scale, 288 * $scale, 18 * $scale)

  $chart = [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new(130 * $scale, 313 * $scale),
    [System.Drawing.PointF]::new(195 * $scale, 239 * $scale),
    [System.Drawing.PointF]::new(243 * $scale, 276 * $scale),
    [System.Drawing.PointF]::new(315 * $scale, 165 * $scale),
    [System.Drawing.PointF]::new(382 * $scale, 313 * $scale),
    [System.Drawing.PointF]::new(344 * $scale, 313 * $scale),
    [System.Drawing.PointF]::new(309 * $scale, 236 * $scale),
    [System.Drawing.PointF]::new(251 * $scale, 326 * $scale),
    [System.Drawing.PointF]::new(200 * $scale, 287 * $scale),
    [System.Drawing.PointF]::new(177 * $scale, 313 * $scale)
  )
  $graphics.FillPolygon($red, $chart)
  $graphics.FillEllipse($green, 297 * $scale, 147 * $scale, 36 * $scale, 36 * $scale)

  $path = Join-Path $OutputDirectory $FileName
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)

  $graphics.Dispose()
  $bitmap.Dispose()
  $white.Dispose()
  $red.Dispose()
  $green.Dispose()
  $ink.Dispose()
}

New-AppIcon -Size 192 -FileName 'app-icon-192.png'
New-AppIcon -Size 512 -FileName 'app-icon-512.png'
New-AppIcon -Size 512 -FileName 'app-icon-maskable-512.png'
