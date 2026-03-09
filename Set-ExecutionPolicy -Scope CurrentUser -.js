Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

rm -rf node_modules package-lock.json
npm install

app.use(express.static('dist/public'));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist/public/index.html')));

server: {
  hmr: { overlay: false },
  fs: { strict: true }
}