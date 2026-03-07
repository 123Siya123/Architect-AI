# Function to check if a port is listening
function Test-Port($p) {
    return [bool](Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)
}

Write-Host "==================================================="
Write-Host "Starting AI House Designer Development Server..."
Write-Host "==================================================="
Write-Host ""

# 1. Cleanup: Check port 3000 and kill if it looks like a leftover node process
$port3000 = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($port3000) {
    Write-Host "Found active process on port 3000 (PID: $($port3000.OwningProcess)). Attempting to clear..."
    try {
        Stop-Process -Id $port3000.OwningProcess -Force -ErrorAction SilentlyContinue
        Write-Host "Successfully cleared port 3000."
        Start-Sleep -Seconds 1
    } catch {
        Write-Host "Warning: Could not clear port 3000. Will attempt to find another port."
    }
}

# 2. Find a free port
$port = 3000
while (Test-Port $port) {
    Write-Host "Port $port is busy, checking next..."
    $port++
}

$url = "http://localhost:$port/design"
Write-Host "Server will start on: $url"

# 3. Start browser waiter
# This job runs in background and checks if the server is up before opening browser
$job = Start-Job -ScriptBlock {
    param($p, $u)
    $attempts = 0
    # Wait up to 60 seconds
    while ($attempts -lt 60) {
        try {
            $client = New-Object System.Net.Sockets.TcpClient
            $client.Connect("localhost", $p)
            $client.Close()
            # Server is ready, open browser
            Start-Process $u
            return
        } catch {
            Start-Sleep -Seconds 1
            $attempts++
        }
    }
} -ArgumentList $port, $url

# 4. Start Server
Write-Host "Starting Node.js server..."
# Use cmd /c npm ... to ensure it works in all shells
$env:PORT = $port
cmd /c "npm run dev -- -p $port"

# Clean up job if server exits
Stop-Job $job -ErrorAction SilentlyContinue
Remove-Job $job -ErrorAction SilentlyContinue
