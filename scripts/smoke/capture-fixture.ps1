Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form = New-Object System.Windows.Forms.Form
$form.Text = 'AquaStar capture test fixture'
$form.ClientSize = New-Object System.Drawing.Size(640, 360)
$script:position = 0
$form.Add_Paint({
    param($sender, $event)
    $event.Graphics.Clear([System.Drawing.Color]::FromArgb(13, 38, 77))
    $event.Graphics.FillRectangle([System.Drawing.Brushes]::OrangeRed, 20, 30, 120, 100)
    $event.Graphics.FillRectangle([System.Drawing.Brushes]::LimeGreen, 180 + $script:position, 180, 75, 75)
})
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 33
$timer.Add_Tick({ $script:position = ($script:position + 2) % 300; $form.Invalidate() })
$form.Add_Shown({ [Console]::WriteLine('AquaStar fixture ready'); [Console]::Out.Flush() })
$timer.Start()
[System.Windows.Forms.Application]::Run($form)
