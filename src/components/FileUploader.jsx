import { useState, useRef } from 'react';
import { UploadCloud, FileType } from 'lucide-react';

const FileUploader = ({ onFileProcessed }) => {
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef(null);

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            processFile(files[0]);
        }
    };

    const handleFileSelect = (e) => {
        const files = e.target.files;
        if (files.length > 0) {
            processFile(files[0]);
        }
    };

    const processFile = (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const arrayBuffer = e.target.result;
            // Pass raw buffer to parent, who will call the decoder
            onFileProcessed(arrayBuffer, file.name);
        };
        reader.readAsArrayBuffer(file);
    };

    return (
        <div className="flex-center" style={{ minHeight: '60vh' }}>
            <div
                className={`card flex-center`}
                style={{
                    width: '100%',
                    maxWidth: '600px',
                    height: '400px',
                    flexDirection: 'column',
                    border: isDragging ? '2px dashed var(--text-accent)' : '2px dashed var(--border-color)',
                    backgroundColor: isDragging ? 'rgba(56, 189, 248, 0.05)' : 'var(--bg-card)',
                    cursor: 'pointer',
                    gap: '1.5rem'
                }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current.click()}
            >
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                    accept=".ctf,.itf,.dat,.bin"
                />

                <div style={{
                    padding: '2rem',
                    borderRadius: '50%',
                    background: 'var(--bg-app)',
                    boxShadow: 'var(--shadow)'
                }}>
                    <UploadCloud size={64} color={isDragging ? 'var(--text-accent)' : 'var(--text-primary)'} />
                </div>

                <div style={{ textAlign: 'center' }}>
                    <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>
                        Drag & Drop or Click to Upload
                    </h3>
                    <p style={{ color: 'var(--text-secondary)' }}>
                        Supported formats: .CTF, .ITF
                    </p>
                </div>
            </div>
        </div>
    );
};

export default FileUploader;
