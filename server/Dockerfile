# Folosește o imagine oficială Python ca bază
FROM python:3.11-slim

# Setează directorul de lucru în container
WORKDIR /app

# Copiază fișierul de dependențe
COPY requirements.txt .

# Instalează dependențele
RUN pip install --no-cache-dir -r requirements.txt

# Copiază codul aplicației în container
COPY . .

# Expune portul pe care Cloud Run îl va asculta
EXPOSE 8080

# Comanda pentru a porni serverul Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]