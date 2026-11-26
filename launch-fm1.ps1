Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$exePath = Join-Path $rootDir "fm1-live.exe"
$fwDir   = Join-Path $rootDir "firmwares"
$saveDir = Join-Path $rootDir "saves"

if (-not (Test-Path $exePath)) {
    [System.Windows.Forms.MessageBox]::Show(
        "Could not find fm1-live.exe in:`n$rootDir",
        "FM-1 Launcher",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
    exit 1
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "FM-1 Emulator Launcher"
$form.Size = New-Object System.Drawing.Size(440, 440)
$form.MinimumSize = New-Object System.Drawing.Size(380, 360)
$form.StartPosition = "CenterScreen"
$form.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)

$lblHeader = New-Object System.Windows.Forms.Label
$lblHeader.Text = "Select a firmware (.fwsc) to launch in fm1-live:"
$lblHeader.Location = New-Object System.Drawing.Point(14, 12)
$lblHeader.AutoSize = $true
$form.Controls.Add($lblHeader)

$listBox = New-Object System.Windows.Forms.ListBox
$listBox.Location = New-Object System.Drawing.Point(14, 38)
$listBox.Size = New-Object System.Drawing.Size(396, 250)
$listBox.Anchor = "Top,Bottom,Left,Right"
$listBox.IntegralHeight = $false
$form.Controls.Add($listBox)

$lblMhz = New-Object System.Windows.Forms.Label
$lblMhz.Text = "Clock (MHz):"
$lblMhz.Location = New-Object System.Drawing.Point(14, 302)
$lblMhz.AutoSize = $true
$lblMhz.Anchor = "Bottom,Left"
$form.Controls.Add($lblMhz)

$cmbMhz = New-Object System.Windows.Forms.ComboBox
$cmbMhz.Location = New-Object System.Drawing.Point(100, 298)
$cmbMhz.Size = New-Object System.Drawing.Size(80, 24)
$cmbMhz.DropDownStyle = "DropDownList"
$cmbMhz.Anchor = "Bottom,Left"
[void]$cmbMhz.Items.AddRange(@("240", "160", "120", "320"))
$cmbMhz.SelectedIndex = 0
$form.Controls.Add($cmbMhz)

$chkFlash = New-Object System.Windows.Forms.CheckBox
$chkFlash.Text = "Save flash (saves\)"
$chkFlash.Location = New-Object System.Drawing.Point(195, 300)
$chkFlash.AutoSize = $true
$chkFlash.Checked = $true
$chkFlash.Anchor = "Bottom,Left"
$form.Controls.Add($chkFlash)

$chkUsb = New-Object System.Windows.Forms.CheckBox
$chkUsb.Text = "USB"
$chkUsb.Location = New-Object System.Drawing.Point(345, 300)
$chkUsb.AutoSize = $true
$chkUsb.Anchor = "Bottom,Left"
$form.Controls.Add($chkUsb)

$btnRefresh = New-Object System.Windows.Forms.Button
$btnRefresh.Text = "Refresh"
$btnRefresh.Location = New-Object System.Drawing.Point(14, 342)
$btnRefresh.Size = New-Object System.Drawing.Size(90, 34)
$btnRefresh.Anchor = "Bottom,Left"
$form.Controls.Add($btnRefresh)

$btnBrowse = New-Object System.Windows.Forms.Button
$btnBrowse.Text = "Browse..."
$btnBrowse.Location = New-Object System.Drawing.Point(112, 342)
$btnBrowse.Size = New-Object System.Drawing.Size(90, 34)
$btnBrowse.Anchor = "Bottom,Left"
$form.Controls.Add($btnBrowse)

$btnLaunch = New-Object System.Windows.Forms.Button
$btnLaunch.Text = "Launch"
$btnLaunch.Location = New-Object System.Drawing.Point(290, 342)
$btnLaunch.Size = New-Object System.Drawing.Size(120, 34)
$btnLaunch.Anchor = "Bottom,Right"
$form.AcceptButton = $btnLaunch
$form.Controls.Add($btnLaunch)

$script:fwMap = @{}

function Load-Firmwares {
    $listBox.Items.Clear()
    $script:fwMap = @{}

    $files = @()
    if (Test-Path $fwDir) {
        $files += Get-ChildItem -Path $fwDir -Filter "*.fwsc" -File | Sort-Object Name
    }
    $files += Get-ChildItem -Path $rootDir -Filter "*.fwsc" -File | Sort-Object Name

    foreach ($file in $files) {
        $display = $file.BaseName
        $script:fwMap[$display] = $file.FullName
        [void]$listBox.Items.Add($display)
    }

    if ($listBox.Items.Count -gt 0) {
        $listBox.SelectedIndex = 0
    }
}

function Start-SelectedFirmware {
    param([string]$fwPath)

    if (-not $fwPath -or -not (Test-Path $fwPath)) {
        return
    }

    $argsList = @("--fwsc", "`"$fwPath`"", "--mhz", $cmbMhz.SelectedItem)

    if ($chkFlash.Checked) {
        if (-not (Test-Path $saveDir)) {
            New-Item -ItemType Directory -Force -Path $saveDir | Out-Null
        }
        $base = [System.IO.Path]::GetFileNameWithoutExtension($fwPath)
        $flashFile = Join-Path $saveDir "$base.flash"
        $argsList += @("--flash", "`"$flashFile`"")
    }

    if ($chkUsb.Checked) {
        $argsList += "--usb"
    }

    Start-Process -FilePath $exePath -ArgumentList $argsList -WorkingDirectory $rootDir
}

$btnRefresh.Add_Click({ Load-Firmwares })

$btnBrowse.Add_Click({
    $dlg = New-Object System.Windows.Forms.OpenFileDialog
    $dlg.InitialDirectory = if (Test-Path $fwDir) { $fwDir } else { $rootDir }
    $dlg.Filter = "FM-1 Firmware (*.fwsc)|*.fwsc|All Files (*.*)|*.*"
    if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        Start-SelectedFirmware -fwPath $dlg.FileName
    }
})

$launchAction = {
    if ($listBox.SelectedItem) {
        $path = $script:fwMap[$listBox.SelectedItem.ToString()]
        Start-SelectedFirmware -fwPath $path
    }
}

$btnLaunch.Add_Click($launchAction)
$listBox.Add_DoubleClick($launchAction)

Load-Firmwares
[void]$form.ShowDialog()
