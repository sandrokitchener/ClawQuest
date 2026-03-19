Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class NativeIconTools {
  [DllImport("user32.dll", CharSet = CharSet.Auto)]
  public static extern bool DestroyIcon(IntPtr handle);
}
"@

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$iconDir = Join-Path $root "desktop\src-tauri\icons"

$sprite = @(
  "................",
  "....oooooo......",
  "...oyyyyyyo.....",
  "...o.....yyo....",
  ".........oyo....",
  "........oyo.....",
  ".......oyo......",
  "......oyo.......",
  "......oo........",
  "................",
  "......oo........",
  ".....oyyo.......",
  ".....oyyo.......",
  "......oo........",
  "................",
  "................"
)

$palette = @{
  "." = [System.Drawing.Color]::FromArgb(255, 45, 48, 54)
  "o" = [System.Drawing.Color]::FromArgb(255, 166, 114, 18)
  "y" = [System.Drawing.Color]::FromArgb(255, 247, 213, 84)
}

function New-SpriteBitmap {
  $bitmap = New-Object System.Drawing.Bitmap 16, 16
  for ($y = 0; $y -lt $sprite.Count; $y++) {
    $row = $sprite[$y]
    for ($x = 0; $x -lt $row.Length; $x++) {
      $glyph = $row.Substring($x, 1)
      $bitmap.SetPixel($x, $y, $palette[$glyph])
    }
  }
  return $bitmap
}

function Save-ScaledPng {
  param(
    [Parameter(Mandatory = $true)] [System.Drawing.Bitmap] $Source,
    [Parameter(Mandatory = $true)] [string] $Path,
    [Parameter(Mandatory = $true)] [int] $Size
  )

  $target = New-Object System.Drawing.Bitmap $Size, $Size
  $graphics = [System.Drawing.Graphics]::FromImage($target)
  $graphics.Clear([System.Drawing.Color]::FromArgb(255, 45, 48, 54))
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
  $graphics.DrawImage($Source, 0, 0, $Size, $Size)
  $target.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $target.Dispose()
}

function Save-Ico {
  param(
    [Parameter(Mandatory = $true)] [System.Drawing.Bitmap] $Source,
    [Parameter(Mandatory = $true)] [string] $Path
  )

  $handle = $Source.GetHicon()
  try {
    $icon = [System.Drawing.Icon]::FromHandle($handle)
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Create)
    try {
      $icon.Save($stream)
    } finally {
      $stream.Dispose()
      $icon.Dispose()
    }
  } finally {
    [void][NativeIconTools]::DestroyIcon($handle)
  }
}

$sizes = @{
  "32x32.png" = 32
  "64x64.png" = 64
  "128x128.png" = 128
  "128x128@2x.png" = 256
  "icon.png" = 512
  "Square30x30Logo.png" = 30
  "Square44x44Logo.png" = 44
  "Square71x71Logo.png" = 71
  "Square89x89Logo.png" = 89
  "Square107x107Logo.png" = 107
  "Square142x142Logo.png" = 142
  "Square150x150Logo.png" = 150
  "Square284x284Logo.png" = 284
  "Square310x310Logo.png" = 310
  "StoreLogo.png" = 50
}

$spriteBitmap = New-SpriteBitmap
try {
  foreach ($entry in $sizes.GetEnumerator()) {
    Save-ScaledPng -Source $spriteBitmap -Path (Join-Path $iconDir $entry.Key) -Size $entry.Value
  }

  $icoBitmap = New-Object System.Drawing.Bitmap 256, 256
  $graphics = [System.Drawing.Graphics]::FromImage($icoBitmap)
  $graphics.Clear([System.Drawing.Color]::FromArgb(255, 45, 48, 54))
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
  $graphics.DrawImage($spriteBitmap, 0, 0, 256, 256)
  $graphics.Dispose()

  try {
    Save-Ico -Source $icoBitmap -Path (Join-Path $iconDir "icon.ico")
  } finally {
    $icoBitmap.Dispose()
  }
} finally {
  $spriteBitmap.Dispose()
}

Write-Host "Updated Claw Quest icon set in $iconDir"
