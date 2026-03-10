# Run MaraAI Locally (Windows PowerShell)

## 1) Install dependencies
```powershell
npm install
```

## 2) Build check
```powershell
npm run build
```

## 3) Start backend (Terminal A)
```powershell
$env:PORT='5000'
$env:HOST='127.0.0.1'
npm run start:backend
```

## 4) Start frontend (Terminal B)
```powershell
npm run dev:frontend -- --host 127.0.0.1 --port 5185 --strictPort
```

## 5) Verify API health
```powershell
Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5000/api/health' | Select-Object -ExpandProperty Content
```

Expected:
```text
{"status":"ok"}
```

## 6) Verify frontend and proxy
```powershell
Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5185/' | Select-Object StatusCode
Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5185/api/health' | Select-Object -ExpandProperty Content
```

## 7) Run runtime smoke test
```powershell
npm run smoke:runtime
```

Expected summary: all checks pass (`200` or expected `401` for unauthenticated endpoints).

## Notes
- Smoke test uses `MARAAI_BASE_URL` only when you want a non-default backend URL.
- Default smoke base URL is `http://localhost:5000`.
