import { useState } from 'react';
import { FileUp, ShieldCheck } from 'lucide-react';
import FileUploader from './components/FileUploader';
import DecodedView from './components/DecodedView';

function App() {
  const [fileData, setFileData] = useState(null);
  const [fileName, setFileName] = useState('');

  const handleFileProcess = (data, name) => {
    setFileData(data);
    setFileName(name);
  };

  const handleReset = () => {
    setFileData(null);
    setFileName('');
  };

  return (
    <div className="container">
      <header className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            background: 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)',
            padding: '10px',
            borderRadius: '12px',
            boxShadow: '0 0 15px rgba(59, 130, 246, 0.5)'
          }}>
            <ShieldCheck size={32} color="white" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>VISA Clearing Decoder</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Secure CTF/ITF File Analysis</p>
          </div>
        </div>
        <div>
          {/* Actions or additional info could go here */}
          <span className="badge">v1.0.0</span>
        </div>
      </header>

      <main>
        {!fileData ? (
          <FileUploader onFileProcessed={handleFileProcess} />
        ) : (
          <DecodedView data={fileData} fileName={fileName} onBack={handleReset} />
        )}
      </main>
    </div>
  );
}

export default App;
