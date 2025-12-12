# CORS and Network Access Issues

## ERR_NETWORK_ACCESS_DENIED Error

This error typically occurs due to CORS (Cross-Origin Resource Sharing) issues when the client and server are on different origins.

## Quick Fix

The server has been updated to allow all origins. Make sure:

1. **Server is running** on Raspberry Pi
2. **CORS is properly configured** (already done in the code)
3. **Firewall allows port 3001** (see FIREWALL_SETUP.md)
4. **Client uses correct API URL** in `.env.local`

## Step-by-Step Troubleshooting

### 1. Verify Server is Running

On Raspberry Pi:
```bash
# Check if server is running
ps aux | grep node

# Check if port 3001 is listening
sudo netstat -tlnp | grep 3001
# Should show: 0.0.0.0:3001
```

### 2. Test API Directly

From your laptop, test the API:
```bash
# Replace with your Raspberry Pi IP
curl -v http://192.168.1.100:3001/health

# Should return JSON response
```

If this fails, it's a network/firewall issue, not CORS.

### 3. Check Browser Console

Open browser DevTools (F12) and check:
- **Console tab**: Look for CORS errors
- **Network tab**: Check if requests are being blocked

### 4. Verify Client Configuration

In `client/.env.local`:
```bash
VITE_API_URL=http://192.168.1.100:3001
```

Make sure:
- No trailing slash
- Correct IP address
- Using `http://` not `https://` (unless you have SSL)

### 5. Check CORS Headers

The server should send these headers:
- `Access-Control-Allow-Origin: *` (or your origin)
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

You can verify with:
```bash
curl -v -H "Origin: http://localhost:3000" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     http://192.168.1.100:3001/api/commands/status
```

### 6. Browser-Specific Issues

#### Chrome/Edge:
- Check if "Block third-party cookies" is enabled
- Try incognito mode
- Check browser console for detailed errors

#### Firefox:
- Check browser console
- Try disabling privacy features temporarily

#### Safari:
- Safari has stricter CORS policies
- May need to enable "Disable Cross-Origin Restrictions" in Develop menu

### 7. Network Issues

If you're on different networks:
- Ensure both devices are on the same network
- Check router firewall settings
- Verify IP addresses are correct

### 8. WebSocket Connection Issues

WebSocket connections can also be blocked. Check:
- Browser console for WebSocket errors
- Network tab shows WebSocket connection attempts
- Server logs show WebSocket connection attempts

## Common Solutions

### Solution 1: Restart Both Server and Client

```bash
# On Raspberry Pi - restart server
cd server
npm run dev

# On laptop - restart client
cd client
npm run dev
```

### Solution 2: Clear Browser Cache

- Hard refresh: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)
- Clear browser cache
- Try incognito/private mode

### Solution 3: Check for Proxy/VPN

- Disable VPN if active
- Check if corporate proxy is interfering
- Try from different network

### Solution 4: Verify Environment Variables

Make sure Vite picks up the environment variable:

```bash
# In client directory
cat .env.local
# Should show: VITE_API_URL=http://192.168.1.100:3001

# Restart dev server after changing .env.local
npm run dev
```

### Solution 5: Use Full URL in Browser

Temporarily test by opening directly in browser:
```
http://192.168.1.100:3001/health
```

Should return JSON. If this works, the issue is with the client configuration.

## Advanced: Production CORS Configuration

For production, you may want to restrict CORS to specific origins:

```typescript
// In server/src/index.ts
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://192.168.1.100:3000', // Your laptop IP
    'http://your-domain.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

## Still Having Issues?

1. **Check server logs** on Raspberry Pi for errors
2. **Check browser console** for detailed error messages
3. **Test with curl** to verify server is accessible
4. **Verify network connectivity** between devices
5. **Check firewall rules** on both devices

## Quick Test Script

Create a test file `test-connection.html`:

```html
<!DOCTYPE html>
<html>
<head>
    <title>API Connection Test</title>
</head>
<body>
    <h1>API Connection Test</h1>
    <button onclick="testAPI()">Test API</button>
    <pre id="result"></pre>
    
    <script>
        async function testAPI() {
            const apiUrl = 'http://192.168.1.100:3001/health'; // Replace with your IP
            const resultEl = document.getElementById('result');
            
            try {
                const response = await fetch(apiUrl);
                const data = await response.json();
                resultEl.textContent = JSON.stringify(data, null, 2);
            } catch (error) {
                resultEl.textContent = 'Error: ' + error.message;
            }
        }
    </script>
</body>
</html>
```

Open this file in your browser and click the button to test the connection.

