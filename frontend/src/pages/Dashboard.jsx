import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { api } from '../api';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  LogOut,
  Book,
  Archive,
  Tag as TagIcon,
  Settings,
  Moon,
  Sun,
  Type,
  X,
  Eye,
  Image,
  MessageCircle,
  Mic
} from 'lucide-react';

export default function Dashboard({ theme, setTheme, font, setFont }) {
  const [notes, setNotes] = useState([]);
  const [search, setSearch] = useState('');
  const [activeNote, setActiveNote] = useState(null);
  const [view, setView] = useState('all');
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user')) || {};
    } catch (e) {
      return {};
    }
  });
  const [notification, setNotification] = useState(null);
  const [notificationType, setNotificationType] = useState('info'); // info, success, error
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchNotes();
  }, []);

  useEffect(() => {
    if (!isChatOpen) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setIsPaused(false);
    }
  }, [isChatOpen]);

  const showNotification = (msg, type = 'info', duration = 3000) => {
    setNotification(msg);
    setNotificationType(type);
    if (duration !== -1) {
      setTimeout(() => setNotification(null), duration);
    }
  };

  const fetchNotes = async () => {
    try {
      const data = await api.getNotes();
      if (Array.isArray(data)) {
        setNotes(data);
      } else if (data.error === 'Access denied' || data.error === 'Invalid token') {
        api.logout();
        navigate('/login');
      } else {
        setNotes([]);
      }
    } catch (err) {
      console.error(err);
      setNotes([]);
    }
  };

  const handleLogout = () => {
    api.logout();
    navigate('/login');
  };

  const createNote = async () => {
    try {
      const newNote = await api.createNote({ title: 'New Note', content: '', tags: [] });
      setNotes([newNote, ...notes]);
      setActiveNote(newNote);
    } catch (err) {
      console.error(err);
    }
  };

  const updateNote = async (id, updates) => {
    try {
      await api.updateNote(id, updates);
      // Merge updates instead of replacing with the {success: true} response
      setNotes(notes.map(n => n.id === id ? { ...n, ...updates } : n));
      if (activeNote?.id === id) setActiveNote({ ...activeNote, ...updates });
    } catch (err) {
      console.error(err);
    }
  };

  const deleteNote = async (id) => {
    try {
      await api.deleteNote(id);
      setNotes(notes.filter(n => n.id !== id));
      if (activeNote?.id === id) setActiveNote(null);
    } catch (err) {
      console.error(err);
    }
  };

  const deleteFile = async (noteId, fileId) => {
    try {
      const res = await api.deleteNoteFile(noteId, fileId);
      if (res.error) {
        showNotification(`Error: ${res.error}`, 'error');
        return;
      }
      // Update local state
      const updatedFiles = activeNote.files.filter(f => f.id !== fileId);
      const updatedNote = { ...activeNote, files: updatedFiles };
      setActiveNote(updatedNote);
      setNotes(notes.map(n => n.id === noteId ? updatedNote : n));
      showNotification("File removed.", 'success');
    } catch (err) {
      console.error(err);
      showNotification("Failed to delete file.", 'error');
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !activeNote) return;
    try {
      showNotification("AI Summarizing...", 'info', -1);
      const res = await api.uploadNoteFile(activeNote.id, file);
      
      if (file.type === 'application/pdf' && (res.content?.includes('NO TEXT DETECTED') || !res.content)) {
        showNotification("AI Deep Scanning Full Concept...", 'info', -1);
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'http://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
            const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(reader.result) });
            const pdf = await loadingTask.promise;
            
            // Scan Page 1 and Middle Page for "Full Concept"
            let fullConceptText = "";
            const pagesToScan = [1];
            if (pdf.numPages > 1) pagesToScan.push(Math.floor(pdf.numPages / 2) + 1);
            
            for (const pageNum of pagesToScan) {
              showNotification(`AI Reading Page ${pageNum} of ${pdf.numPages}...`, 'info', -1);
              const page = await pdf.getPage(pageNum);
              const viewport = page.getViewport({ scale: 1.5 });
              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d');
              canvas.height = viewport.height; canvas.width = viewport.width;
              await page.render({ canvasContext: context, viewport }).promise;
              const { data: { text } } = await window.Tesseract.recognize(canvas, 'eng');
              fullConceptText += text + "\n";
            }

            if (fullConceptText.length > 50) {
              const sentences = fullConceptText.split('\n').filter(l => l.trim().length > 30);
              const narrative = [...sentences.slice(0, 3), ...sentences.slice(-3)].map(l => l.trim()).join(' ');
              const finalContent = `### 📖 FULL TOPIC EXPLANATION\n\n${narrative}\n\n---`;
              const finalNote = await api.updateNote(activeNote.id, { content: finalContent });
              setActiveNote(finalNote);
              showNotification("Full Narrative Scan Successful!", 'success', 5000);
            }
          } catch (ocrErr) { console.error(ocrErr); }
          const allNotes = await api.getNotes();
          setNotes(allNotes);
        };
        reader.readAsArrayBuffer(file);
      } else {
        setNotification(null);
        const allNotes = await api.getNotes();
        setNotes(allNotes);
        setActiveNote(res);
        showNotification(`Success! Analyzed.`, 'success', 5000);
      }
    } catch (err) {
      console.error(err);
      setNotification(null);
      showNotification("Upload failed.", 'error', 5000);
    }
  };

  const filteredNotes = Array.isArray(notes) ? notes.filter(n => {
    const matchesSearch = (n.title?.toLowerCase() || '').includes(search.toLowerCase()) ||
      (n.content?.toLowerCase() || '').includes(search.toLowerCase());
    if (view === 'archived') return n.isArchived && matchesSearch;
    return !n.isArchived && matchesSearch;
  }) : [];

  const getNotificationColor = () => {
    if (notificationType === 'success') return '#10b981'; // Green
    if (notificationType === 'error') return '#ef4444';   // Red
    return 'var(--primary)'; // Blue/Info
  };

  const speakText = (text) => {
    if (!text) return;
    window.speechSynthesis.cancel();
    
    // Smart cleaning for speech: Remove technical noise like coordinates (42,1), section numbers (7.2), etc.
    const cleanText = text
      // Remove all image markdown like ![...](https://...) completely so it doesn't read URLs
      .replace(/!\[.*?\]\s?\(.*?\)/gi, '')
      .replace(/###/g, '')
      .replace(/##/g, '')
      .replace(/#/g, '')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/---/g, '')
      // Remove section numbers like 7.2. at start of lines
      .replace(/^\d+\.\d+\.?\s+/gm, '')
      // Remove figure/table references like Figure 7.3
      .replace(/(Figure|Table|Fig)\.?\s+\d+\.\d+/gi, '')
      // Remove coordinate-like noise from OCR like 42,1) or (43,3)
      .replace(/\(?\d+,\s?\d+\)?/g, '')
      // Remove page references
      .replace(/p\d+/gi, '')
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    const voices = window.speechSynthesis.getVoices();
    if (user.gender === 'female') {
      const femaleVoice = voices.find(v => v.name.includes('Female') || v.name.includes('Zira') || v.name.includes('Google US English')) || voices[0];
      utterance.voice = femaleVoice;
      utterance.pitch = 1.2;
    } else {
      const maleVoice = voices.find(v => v.name.includes('Male') || v.name.includes('David') || v.name.includes('Google UK English Male')) || voices[0];
      utterance.voice = maleVoice;
      utterance.pitch = 0.9;
    }

    utterance.onstart = () => { setIsSpeaking(true); setIsPaused(false); };
    utterance.onend = () => { setIsSpeaking(false); setIsPaused(false); };
    utterance.onerror = () => { setIsSpeaking(false); setIsPaused(false); };
    
    window.speechSynthesis.speak(utterance);
  };

  const pauseSpeech = () => {
    window.speechSynthesis.pause();
    setIsPaused(true);
  };

  const resumeSpeech = () => {
    window.speechSynthesis.resume();
    setIsPaused(false);
  };

  const stopSpeech = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
  };

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatMessage.trim() || isChatLoading) return;

    const userMsg = { role: 'user', content: chatMessage };
    setChatHistory(prev => [...prev, userMsg]);
    const currentMessage = chatMessage;
    setChatMessage('');
    setIsChatLoading(true);

    try {
      if (!activeNote) {
        throw new Error("Please select a note first.");
      }

      const response = await api.chat(activeNote.id, currentMessage);
      const botMsg = { role: 'assistant', content: response.content };
      setChatHistory(prev => [...prev, botMsg]);
      speakText(response.content);
    } catch (err) {
      console.error(err);
      const errorMsg = { role: 'assistant', content: "⚠️ **AI Assistant is currently busy.** Please try again in a moment!" };
      setChatHistory(prev => [...prev, errorMsg]);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="app-container">
      {/* Notification Toast */}
      {notification && (
        <div style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          background: getNotificationColor(),
          color: 'white',
          padding: '1rem 2rem',
          borderRadius: '0.5rem',
          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)',
          zIndex: 1000,
          animation: 'slideUp 0.3s ease-out',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          fontWeight: '600'
        }}>
          {notificationType === 'success' && '✅'}
          {notificationType === 'error' && '❌'}
          {notificationType === 'info' && '⏳'}
          {notification}
        </div>
      )}

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo">
          <Book size={28} /> NoteShare
        </div>

        <ul className="nav-links">
          <li className={`nav-item ${view === 'all' ? 'active' : ''}`} onClick={() => setView('all')}>
            <Book size={20} /> All Notes
          </li>
          <li className={`nav-item ${view === 'documents' ? 'active' : ''}`} onClick={() => setView('documents')}>
            <Book size={20} /> All Documents
          </li>
          <div style={{ marginTop: '2rem', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '0.75rem', paddingLeft: '1rem' }}>
            YOUR ROLE: {user.role?.toUpperCase()}
          </div>
          {user.role === 'admin' && (
            <li className="nav-item">
              <Settings size={20} /> Admin Portal
            </li>
          )}
        </ul>

        <div className="sidebar-footer" style={{ marginTop: 'auto' }}>
          <div className="nav-item" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />} {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </div>
          <div className="nav-item" onClick={() => setFont(font === 'sans' ? 'serif' : 'sans')}>
            <Type size={20} /> Change Font
          </div>
          <div className="nav-item" onClick={handleLogout}>
            <LogOut size={20} /> Logout
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="header">
          <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
            <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
            <input
              type="text"
              placeholder="Search notes..."
              className="form-input"
              style={{ paddingLeft: '40px' }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="btn" style={{ width: 'auto', padding: '0.625rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '1rem' }} onClick={createNote}>
            <Plus size={20} /> Create New Note
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 1rem', background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border)' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: '700', fontSize: '0.875rem', color: 'var(--text-main)' }}>{user.username}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--primary)', textTransform: 'uppercase', fontWeight: '900', letterSpacing: '0.05em' }}>{user.role}</div>
            </div>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--primary), var(--accent))',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '700',
              fontSize: '1rem',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }}>
              {user.username?.[0]?.toUpperCase()}
            </div>
          </div>
        </header>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Note List */}
          <div style={{ width: '350px', borderRight: '1px solid var(--border)', overflowY: 'auto', padding: '1rem' }}>
            {filteredNotes.map(note => (
              <div
                key={note.id}
                className={`note-card ${activeNote?.id === note.id ? 'active' : ''}`}
                style={{ marginBottom: '1rem', border: activeNote?.id === note.id ? '1px solid var(--primary)' : '1px solid var(--border)' }}
                onClick={() => setActiveNote(note)}
              >
                <h3 style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>{note.title}</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {note.content?.substring(0, 100) || 'No content...'}
                </p>
                <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  {note.isPublished ?
                    <span style={{ fontSize: '0.65rem', background: '#10b981', color: 'white', padding: '2px 6px', borderRadius: '4px', fontWeight: '800' }}>PUBLISHED</span> :
                    <span style={{ fontSize: '0.65rem', background: '#f43f5e', color: 'white', padding: '2px 6px', borderRadius: '4px', fontWeight: '800' }}>DRAFT</span>
                  }
                  {note.tags?.map(t => <span key={t} className="note-tag">{t}</span>)}
                </div>
              </div>
            ))}
          </div>

          {/* Editor */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {activeNote ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '2rem', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
                  <input
                    className="form-input"
                    style={{ fontSize: '2rem', fontWeight: '800', background: 'transparent', border: 'none', padding: 0, width: '100%', cursor: activeNote.canEdit === false ? 'default' : 'text' }}
                    value={activeNote.title}
                    readOnly={activeNote.canEdit === false}
                    onChange={(e) => updateNote(activeNote.id, { title: e.target.value })}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {activeNote.canEdit !== false && user.role !== 'student' && (
                      <button
                        className="btn"
                        style={{
                          width: 'auto',
                          background: activeNote.isuploded ? '#10b981' : 'var(--primary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}
                        onClick={() => updateNote(activeNote.id, { isPublished: !activeNote.isPublished })}
                      >
                        {activeNote.isPublished ? '✅ Published' : '📤 Publish to Students'}
                      </button>
                    )}
                    {activeNote.canEdit !== false && user.role !== 'student' && (
                      <label className="btn" style={{ width: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-main)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Plus size={18} /> Upload PDF/Image
                        <input type="file" style={{ display: 'none' }} onChange={handleFileUpload} accept=".pdf,.jpg,.jpeg,.png" />
                      </label>
                    )}
                    {activeNote.canEdit !== false && (
                      <>
                        <button className="btn" style={{ width: 'auto', background: 'var(--bg-card)', color: 'var(--text-main)', border: '1px solid var(--border)' }} onClick={() => updateNote(activeNote.id, { isArchived: !activeNote.isArchived })}>
                          {activeNote.isArchived ? 'Unarchive' : 'Archive'}
                        </button>
                        <button className="btn" style={{ width: 'auto', background: 'var(--accent)' }} onClick={() => deleteNote(activeNote.id)}>Delete</button>
                      </>
                    )}
                    {activeNote.canEdit === false && <span className="note-tag" style={{ background: 'var(--accent)', color: 'white' }}>READ ONLY</span>}
                  </div>
                </div>

                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    {activeNote.isPublished ? '🌍 Visible to Students' : '🔒 Private Draft'}
                  </div>

                {/* PDF/Files moved to the top for better visibility */}
                {activeNote.files?.length > 0 && (
                  <div style={{ marginTop: '1rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {activeNote.files.map(f => (
                      <div key={f.id} style={{ border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden', background: 'var(--bg-card)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                        <div style={{ padding: '0.75rem 1rem', background: 'rgba(99, 102, 241, 0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <Book size={18} style={{ color: 'var(--primary)' }} />
                            <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>{f.originalName}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '1rem' }}>
                             <a href={`/api/files/${f.filename}`} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontSize: '0.85rem', fontWeight: '700', textDecoration: 'none' }}>View PDF</a>
                             <a href={`/api/files/${f.filename}?download=true`} style={{ color: '#10b981', fontSize: '0.85rem', fontWeight: '700', textDecoration: 'none' }}>Download</a>
                             {activeNote.canEdit !== false && <button onClick={() => deleteFile(activeNote.id, f.id)} style={{ color: 'var(--accent)', fontSize: '0.85rem', fontWeight: '700', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>}
                          </div>
                        </div>
                        {f.mimeType === 'application/pdf' && (
                          <div style={{ height: '600px', width: '100%', background: '#525659' }}>
                            <iframe src={`/api/files/${f.filename}`} width="100%" height="100%" style={{ border: 'none' }} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <textarea
                  className="form-input"
                  style={{ flex: 1, background: 'transparent', border: 'none', padding: 0, resize: 'none', fontSize: '1.125rem', lineHeight: '1.7', cursor: activeNote.canEdit === false ? 'default' : 'text', minHeight: '400px' }}
                  placeholder="Start writing or upload a PDF to auto-generate content..."
                  value={activeNote.content || ''}
                  readOnly={activeNote.canEdit === false}
                  onChange={(e) => updateNote(activeNote.id, { content: e.target.value })}
                />
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'var(--text-muted)' }}>
                <Book size={64} style={{ marginBottom: '1rem', opacity: 0.2 }} />
                <p>Select a note to view or edit</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* AI Chatbot Floating Button */}
      <button 
        onClick={() => setIsChatOpen(!isChatOpen)}
        style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--primary), var(--accent))',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
          cursor: 'pointer',
          zIndex: 2000,
          border: 'none',
          transition: 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
      >
        {isChatOpen ? <X size={28} /> : <MessageCircle size={28} />}
      </button>

      {/* Chatbot Window */}
      {isChatOpen && (
        <div style={{
          position: 'fixed',
          bottom: '6.5rem',
          right: '2rem',
          width: '350px',
          height: '500px',
          background: 'var(--bg-card)',
          borderRadius: '1.5rem',
          boxShadow: '0 20px 50px -10px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          zIndex: 2000,
          border: '1px solid var(--border)',
          animation: 'slideUp 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        }}>
          <div style={{ padding: '1.25rem', background: 'linear-gradient(135deg, var(--primary), var(--accent))', color: 'white' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '10px', height: '10px', background: '#10b981', borderRadius: '50%', boxShadow: '0 0 10px #10b981' }}></div>
              <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '800' }}>AI Study Assistant</h3>
            </div>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', opacity: 0.8 }}>Voice: {user.gender === 'female' ? 'Female Assistant' : 'Male Assistant'}</p>
          </div>

          <div style={{ flex: 1, padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }} className="chat-window">
            <div style={{ alignSelf: 'flex-start', background: 'var(--bg-main)', padding: '1rem', borderRadius: '1rem 1rem 1rem 0', maxWidth: '85%', fontSize: '0.875rem', border: '1px solid var(--border)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
              Hello <strong>{user.username}</strong>! I'm your AI assistant. Ask me anything about your uploaded notes or PDFs!
            </div>
            
            {chatHistory.map((msg, i) => {
              const imgRegex = /!?\[.*?\]\s?\((https?:\/\/[^\s)]+)\)|(https?:\/\/(?:image\.)?pollinations\.ai[^\s)]+)|(https?:\/\/[^\s)]+\.(?:png|jpg|jpeg|gif|webp))/i;
              const imgMatch = msg.content.match(imgRegex);
              let imgSrc = null;
              let cleanContent = msg.content;
              
              if (imgMatch) {
                imgSrc = imgMatch[1] || imgMatch[2] || imgMatch[3];
                cleanContent = msg.content.replace(imgMatch[0], '').trim();
                
                // Auto-fix the URL in case the backend hasn't been restarted yet
                if (imgSrc && imgSrc.includes('pollinations.ai/p/')) {
                  imgSrc = imgSrc.replace('pollinations.ai/p/', 'image.pollinations.ai/prompt/');
                }
              }
              
              const isOnlyImage = !cleanContent && imgSrc;

              return (
                <div key={i} style={{ 
                  alignSelf: msg.role === 'user' ? 'flex-end' : (isOnlyImage ? 'center' : 'flex-start'), 
                  background: isOnlyImage ? 'transparent' : (msg.role === 'user' ? 'linear-gradient(135deg, #6366f1, #a855f7)' : 'rgba(255, 255, 255, 0.04)'), 
                  color: 'white',
                  padding: isOnlyImage ? '0' : '1rem 1.25rem', 
                  borderRadius: isOnlyImage ? '1rem' : (msg.role === 'user' ? '1.5rem 1.5rem 0.25rem 1.5rem' : '1.5rem 1.5rem 1.5rem 0.25rem'), 
                  maxWidth: isOnlyImage ? '100%' : '85%', 
                  width: isOnlyImage ? '100%' : 'auto',
                  fontSize: '0.9375rem', 
                  border: isOnlyImage ? 'none' : (msg.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.08)'),
                  boxShadow: isOnlyImage ? 'none' : '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                  marginBottom: '1.5rem',
                  backdropFilter: (msg.role === 'user' || isOnlyImage) ? 'none' : 'blur(12px)',
                  position: 'relative'
                }}>
                  <div style={{ minWidth: 0, width: '100%' }}>
                    {cleanContent && (
                      <ReactMarkdown 
                        components={{
                          p: ({children}) => <p style={{ margin: 0, lineHeight: '1.7' }}>{children}</p>
                        }}
                      >
                        {cleanContent}
                      </ReactMarkdown>
                    )}
                    {imgSrc && (
                      <div className="visual-card" style={{ 
                        marginTop: cleanContent ? '1rem' : '0',
                        background: '#ffffff',
                        borderRadius: '1rem',
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                        overflow: 'hidden',
                        width: '100%',
                        maxWidth: '800px',
                        margin: '0 auto'
                      }}>
                        <img 
                          src={imgSrc} 
                          alt="Study Visual" 
                          style={{ width: '100%', height: 'auto', display: 'block' }} 
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isChatLoading && (
              <div style={{ alignSelf: 'flex-start', background: 'var(--bg-main)', padding: '0.875rem 1rem', borderRadius: '1rem 1rem 1rem 0', maxWidth: '85%', fontSize: '0.875rem', border: '1px solid var(--border)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <div className="dot-pulse"></div>
                  <div className="dot-pulse" style={{ animationDelay: '0.2s' }}></div>
                  <div className="dot-pulse" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            )}

            {isSpeaking && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', padding: '0.5rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '0.75rem', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--primary)' }}>AI SPEAKING...</div>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  {isPaused ? (
                    <button onClick={resumeSpeech} className="btn" style={{ width: 'auto', padding: '0.25rem 0.75rem', fontSize: '0.7rem' }}>▶ Resume</button>
                  ) : (
                    <button onClick={pauseSpeech} className="btn" style={{ width: 'auto', padding: '0.25rem 0.75rem', fontSize: '0.7rem', background: '#f59e0b' }}>⏸ Pause</button>
                  )}
                  <button onClick={stopSpeech} className="btn" style={{ width: 'auto', padding: '0.25rem 0.75rem', fontSize: '0.7rem', background: 'var(--accent)' }}>⏹ Stop</button>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleChatSubmit} style={{ padding: '1rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.5rem' }}>
            <input 
              type="text" 
              placeholder="Ask about your PDF..." 
              className="form-input" 
              style={{ fontSize: '0.875rem' }}
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
            />
            <button type="submit" className="btn" style={{ width: 'auto', padding: '0.5rem 1rem' }}>
              Ask
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
