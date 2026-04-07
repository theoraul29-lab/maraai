import React, { useState } from 'react';
import axios from 'axios';

function App() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const askAi = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      // Trimitem către backend-ul de Python (port 8000)
      const res = await axios.post('http://127.0.0.1:8000/api/ai', {
        prompt: prompt,
      });
      setResponse(res.data.response);
    } catch (err) {
      setResponse('Eroare: Mara nu a putut răspunde. Verifică dacă serverul Python e pornit!');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Mara AI</h1>
      <textarea
        style={{ width: '100%', height: '100px', padding: '10px', borderRadius: '8px', border: '1px solid #ccc' }}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Scrie-i ceva lui Mara..."
      />
      <br />
      <button
        onClick={askAi}
        disabled={loading}
        style={{
          marginTop: '10px',
          padding: '10px 20px',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer',
        }}
      >
        {loading ? 'Se gândește...' : 'Întreabă pe Mara'}
      </button>

      {response && (
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f0f0f0', borderRadius: '8px' }}>
          <strong>Mara:</strong>
          <p>{response}</p>
        </div>
      )}
    </div>
  );
}

// ASIGURĂ-TE CĂ ACEASTĂ LINIE ESTE LA FINAL:
export default App;