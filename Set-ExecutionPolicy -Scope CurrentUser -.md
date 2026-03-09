Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

cd backend
node src/server.js

http://localhost:3001/
