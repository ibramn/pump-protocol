# Firewall Setup for Raspberry Pi Server

This guide explains how to allow port 3001 to be accessible from your network.

## Option 1: Using UFW (Uncomplicated Firewall) - Recommended

UFW is the default firewall tool on most Raspberry Pi OS installations.

### Check if UFW is installed:
```bash
which ufw
```

### If not installed, install it:
```bash
sudo apt update
sudo apt install ufw
```

### Allow port 3001:
```bash
# Allow incoming connections on port 3001
sudo ufw allow 3001/tcp

# Or allow from specific IP (more secure):
sudo ufw allow from YOUR_LAPTOP_IP to any port 3001

# Check UFW status
sudo ufw status
```

### Enable UFW (if not already enabled):
```bash
sudo ufw enable
```

### View detailed status:
```bash
sudo ufw status verbose
```

## Option 2: Using iptables (Advanced)

If you prefer using iptables directly:

```bash
# Allow incoming TCP connections on port 3001
sudo iptables -A INPUT -p tcp --dport 3001 -j ACCEPT

# Save the rules (on Debian/Ubuntu):
sudo iptables-save | sudo tee /etc/iptables/rules.v4

# Or on some systems:
sudo netfilter-persistent save
```

## Option 3: Using firewall-cmd (CentOS/RHEL/Fedora)

If your Raspberry Pi uses firewalld:

```bash
# Allow port 3001
sudo firewall-cmd --permanent --add-port=3001/tcp

# Reload firewall
sudo firewall-cmd --reload

# Check status
sudo firewall-cmd --list-ports
```

## Verify Server is Listening on All Interfaces

Make sure the server is binding to `0.0.0.0` (all interfaces) and not just `127.0.0.1` (localhost).

Check the server code in `server/src/index.ts` - it should use:
```typescript
server.listen(PORT, '0.0.0.0', async () => {
  // ...
});
```

Or you can set it via environment variable:
```bash
HOST=0.0.0.0 npm start
```

## Test the Connection

### From your laptop, test if the port is accessible:

```bash
# Test HTTP connection
curl http://RASPBERRY_PI_IP:3001/health

# Test if port is open
telnet RASPBERRY_PI_IP 3001
# or
nc -zv RASPBERRY_PI_IP 3001
```

### Check what's listening on the server:

```bash
# On Raspberry Pi, check if server is listening
sudo netstat -tlnp | grep 3001
# or
sudo ss -tlnp | grep 3001
```

## Security Considerations

### 1. Restrict to Specific IP (More Secure)

Instead of allowing all IPs, restrict to your laptop's IP:

```bash
# Find your laptop's IP first, then:
sudo ufw allow from YOUR_LAPTOP_IP to any port 3001
```

### 2. Use SSH Tunnel (Most Secure)

If you want extra security, you can use SSH tunneling:

```bash
# On your laptop, create SSH tunnel:
ssh -L 3001:localhost:3001 pi@RASPBERRY_PI_IP

# Then in your client .env.local:
VITE_API_URL=http://localhost:3001
```

### 3. Use Reverse Proxy with HTTPS (Production)

For production, consider using nginx as a reverse proxy with SSL:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Troubleshooting

### Port is still not accessible:

1. **Check if server is running:**
   ```bash
   ps aux | grep node
   ```

2. **Check if server is binding to correct interface:**
   ```bash
   sudo netstat -tlnp | grep 3001
   ```
   Should show `0.0.0.0:3001` not `127.0.0.1:3001`

3. **Check firewall status:**
   ```bash
   sudo ufw status verbose
   ```

4. **Check router/firewall:**
   - If Raspberry Pi is behind a router, ensure port forwarding is set up
   - Check if your network has additional firewalls

5. **Test locally first:**
   ```bash
   # On Raspberry Pi itself:
   curl http://localhost:3001/health
   ```

### Common Issues:

- **"Connection refused"**: Server not running or not binding to correct interface
- **"Connection timed out"**: Firewall blocking or network issue
- **"Permission denied"**: Need to run with sudo or check permissions

## Quick Reference

```bash
# Allow port 3001 (UFW)
sudo ufw allow 3001/tcp

# Check status
sudo ufw status

# Enable UFW
sudo ufw enable

# Check what's listening
sudo netstat -tlnp | grep 3001
```

