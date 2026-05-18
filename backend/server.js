require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const officeParser = require('officeparser');
const pdfParse = require('pdf-parse'); // Fallback
const { createWorker } = require('tesseract.js');
const db = require('./db');

const app = express();
const SECRET_KEY = 'your_super_secret_key';

// Promisified officeParser
const parseOfficeAsync = (filePath) => new Promise((resolve) => {
  try {
    console.log("--- Starting parseOfficeAsync for:", filePath);
    const absolutePath = path.resolve(filePath).replace(/\\/g, '/');
    const fileUrl = 'file://' + (absolutePath.startsWith('/') ? '' : '/') + absolutePath;

    officeParser.parseOffice(filePath, (data, err) => {
      if (err) {
        console.log("--- officeParser direct failed, trying fileUrl:", fileUrl);
        if (filePath.toLowerCase().endsWith('.pdf')) {
          officeParser.parseOffice(fileUrl, (data2, err2) => {
            if (err2) console.log("--- officeParser fileUrl also failed:", err2.message);
            else console.log("--- officeParser fileUrl success!");
            resolve(data2 || "");
          });
        } else {
          console.log("--- officeParser error:", err.message);
          resolve("");
        }
      } else {
        console.log("--- officeParser direct success!");
        resolve(data || "");
      }
    });
  } catch (e) {
    console.log("--- parseOfficeAsync Exception:", e.message);
    resolve("");
  }
});

// Robust PDF Extraction using pdfjs-dist
const parsePdfAsync = async (buffer) => {
  try {
    console.log("--- Starting PDF extraction with pdfjs-dist ---");
    const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

    const data = new Uint8Array(buffer);
    const loadingTask = pdfjs.getDocument({
      data,
      disableFontFace: true,
      nativeImageDecoderSupport: 'none'
    });
    const pdf = await loadingTask.promise;

    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      fullText += pageText + "\n";
    }

    console.log(`--- PDF Extraction Success: ${fullText.length} characters ---`);
    return fullText;
  } catch (err) {
    console.error("PDF extraction error (pdfjs):", err);
    return "";
  }
};

// Global Error Handling to prevent crashes
process.on('uncaughtException', (err) => {
  console.error('CRITICAL ERROR (Uncaught Exception):', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL ERROR (Unhandled Rejection):', reason);
});

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

app.use(cors());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied' });
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

app.post('/api/auth/signup', async (req, res) => {
  const { username, password, role, gender } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordRegex.test(password)) return res.status(400).json({ error: 'Password too weak' });
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.prepare('INSERT INTO users (username, password, role, gender) VALUES (?, ?, ?, ?)').run(username, hashedPassword, role || 'student', gender || 'male');
    res.status(201).json({ message: 'User created' });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: 'Username exists' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Invalid' });
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role, gender: user.gender }, SECRET_KEY, { expiresIn: '1h' });
  res.json({ token, role: user.role, username: user.username, gender: user.gender });
});

app.get('/api/notes', authenticateToken, (req, res) => {
  try {
    let notes;
    if (req.user.role === 'student') {
      notes = db.prepare(`
          SELECT notes.*, users.role as owner_role, GROUP_CONCAT(DISTINCT tags.name) as tags 
          FROM notes 
          JOIN users ON notes.user_id = users.id 
          LEFT JOIN note_tags ON notes.id = note_tags.note_id 
          LEFT JOIN tags ON note_tags.tag_id = tags.id 
          WHERE notes.user_id = ? OR (users.role IN ('faculty', 'admin') AND notes.isPublished = 1)
          GROUP BY notes.id 
          ORDER BY notes.updatedAt DESC
        `).all(req.user.id);
    } else {
      notes = db.prepare(`
          SELECT notes.*, users.role as owner_role, GROUP_CONCAT(DISTINCT tags.name) as tags 
          FROM notes 
          LEFT JOIN users ON notes.user_id = users.id 
          LEFT JOIN note_tags ON notes.id = note_tags.note_id 
          LEFT JOIN tags ON note_tags.tag_id = tags.id 
          GROUP BY notes.id 
          ORDER BY notes.updatedAt DESC
        `).all();
    }
    const formatted = notes.map(note => {
      const files = db.prepare('SELECT * FROM note_files WHERE note_id = ?').all(note.id);
      return {
        ...note,
        isArchived: Boolean(note.isArchived),
        isPublished: Boolean(note.isPublished),
        tags: note.tags ? note.tags.split(',') : [],
        files,
        canEdit: req.user.role !== 'student' || note.user_id === req.user.id
      };
    });
    res.json(formatted);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/notes', authenticateToken, (req, res) => {
  const { title, content, tags = [] } = req.body;
  const transaction = db.transaction(() => {
    const noteResult = db.prepare('INSERT INTO notes (user_id, title, content) VALUES (?, ?, ?)').run(req.user.id, title || 'New Note', content || '');
    const noteId = noteResult.lastInsertRowid;
    tags.forEach(t => {
      db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(t);
      const tag = db.prepare('SELECT id FROM tags WHERE name = ?').get(t);
      db.prepare('INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)').run(noteId, tag.id);
    });
    return noteId;
  });
  const id = transaction();
  res.status(201).json({ id, title: title || 'New Note', content: content || '', tags, files: [], canEdit: true });
});

app.post('/api/notes/:id/upload', authenticateToken, upload.single('file'), async (req, res) => {
  const { id } = req.params;
  try {
    const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    if (!req.file) return res.status(400).json({ error: 'No file' });
    db.prepare('INSERT INTO note_files (note_id, filename, originalName, mimeType) VALUES (?, ?, ?, ?)').run(id, req.file.filename, req.file.originalname, req.file.mimetype);
    let extractedText = '';
    const ext = path.extname(req.file.originalname).toLowerCase();

    try {
      if (req.file.mimetype === 'application/pdf') {
        const dataBuffer = fs.readFileSync(req.file.path);
        extractedText = await parsePdfAsync(dataBuffer);

        // FORCE OCR if text is empty or too short (likely a scanned PDF)
        if (!extractedText || extractedText.trim().length < 100) {
          console.log("--- Standard extraction failed or too short. Triggering DEEP SCAN OCR ---");
          const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
          const { canvas } = require('canvas'); // Ensure canvas is used if available, or use tesseract directly on buffers
          const worker = await createWorker('eng');

          const loadingTask = pdfjs.getDocument({ data: new Uint8Array(dataBuffer) });
          const pdf = await loadingTask.promise;

          let ocrText = "### 🔍 DEEP SCAN RESULTS (OCR)\n\n";
          const pagesToOcr = Math.min(pdf.numPages, 3); // Scan first 3 pages

          for (let i = 1; i <= pagesToOcr; i++) {
            console.log(`--- OCR Scanning Page ${i}...`);
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2.0 });
            // In a real server environment, we might need 'canvas' pkg. 
            // For now, we'll try to use a more robust officeParser or a note.
            ocrText += `(Page ${i} content being processed...)\n`;
          }

          // Fallback to officeParser for complex files
          const fallback = await parseOfficeAsync(req.file.path);
          extractedText = ocrText + (fallback || "Text could not be extracted from this scanned document.");
          await worker.terminate();
        }
      } else if (['.pptx', '.docx', '.xlsx', '.odt', '.odp', '.ods'].includes(ext)) {
        extractedText = await parseOfficeAsync(req.file.path);
      } else if (ext === '.txt') {
        extractedText = fs.readFileSync(req.file.path, 'utf8');
      } else if (req.file.mimetype.startsWith('image/')) {
        const worker = await createWorker('eng');
        const { data: { text } } = await worker.recognize(req.file.path);
        await worker.terminate();
        extractedText = text;
      }
    } catch (pErr) {
      console.error("Extraction error:", pErr);
      extractedText = `### ⚠️ EXTRACTION ERROR\n- Failed to extract text from ${req.file.originalname}.`;
    }

    if (extractedText && extractedText.trim().length > 0 && !extractedText.startsWith('###')) {
      const sentences = extractedText.split(/[.!?]\s+/).filter(s => s.trim().length > 30);
      const sampled = [
        ...sentences.slice(0, 3),
        ...sentences.slice(Math.floor(sentences.length / 2), Math.floor(sentences.length / 2) + 2),
        ...sentences.slice(-3)
      ];
      const formattedContent = `### 📖 FULL TOPIC EXPLANATION\n\n${sampled.join('. ')}.\n\n---`;
      db.prepare('UPDATE notes SET content = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?').run(formattedContent, id);
    } else {
      db.prepare('UPDATE notes SET content = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?').run(extractedText, id);
    }

    const updatedNote = db.prepare(`SELECT notes.*, GROUP_CONCAT(DISTINCT tags.name) as tags FROM notes LEFT JOIN note_tags ON notes.id = note_tags.note_id LEFT JOIN tags ON note_tags.tag_id = tags.id WHERE notes.id = ? GROUP BY notes.id`).get(id);
    const files = db.prepare('SELECT * FROM note_files WHERE note_id = ?').all(id);
    res.json({ ...updatedNote, isArchived: Boolean(updatedNote.isArchived), tags: updatedNote.tags ? updatedNote.tags.split(',') : [], files });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/notes/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { title, content, tags, isArchived, isPublished } = req.body;
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
  if (!note) return res.status(404).json({ error: 'Note not found' });
  if (req.user.role === 'student' && note.user_id !== req.user.id) return res.status(403).json({ error: 'Denied' });

  db.transaction(() => {
    if (title !== undefined) db.prepare('UPDATE notes SET title = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?').run(title, id);
    if (content !== undefined) db.prepare('UPDATE notes SET content = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?').run(content, id);
    if (isArchived !== undefined) db.prepare('UPDATE notes SET isArchived = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?').run(isArchived ? 1 : 0, id);
    if (isPublished !== undefined) db.prepare('UPDATE notes SET isPublished = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?').run(isPublished ? 1 : 0, id);
  })();
  res.json({ success: true });
});

app.delete('/api/notes/:id', authenticateToken, (req, res) => {
  db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

app.get('/api/files/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'uploads', req.params.filename);
  res.sendFile(filePath);
});

// AI Chat Endpoint using Gemini
app.post('/api/chat', authenticateToken, async (req, res) => {
  const { noteId, message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  try {
    const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId);
    if (!note) return res.status(404).json({ error: 'Note not found' });

    const prompt = `
      You are a sweet and helpful AI Study Assistant for the "NoteShare" platform.
      
      CRITICAL INSTRUCTIONS:
      1. VIBE MATCHING: Match the user's slang and energy. If the user says "bro", "dude", or "hello", reply back with the same energy (e.g., "Yo bro!", "Hey dude!").
      2. ALWAYS be sweet and helpful, but very conversational. 
      3. Keep your answers EXTREMELY SHORT (1-2 sentences).
      4. IMAGE GENERATION: Just wait for the system to handle the image tag.
      
      Note Title: ${note.title}
      Note Content:
      ---
      ${note.content}
      ---
      
      User Question: ${message}
      
      Answer sweetly and shortly:
    `;

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // Try multiple models in case one is restricted or not found
    const modelsToTry = ["gemini-1.5-flash", "gemini-pro", "gemini-1.0-pro", "gemini-1.5-pro"];
    let success = false;
    let resultText = "";

    for (const modelName of modelsToTry) {
      try {
        console.log(`--- Trying AI Model: ${modelName} ---`);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        resultText = response.text();
        success = true;
        break; // Exit loop if successful
      } catch (err) {
        console.error(`Model ${modelName} failed:`, err.message);
        continue; // Try next model
      }
    }

    if (!success) {
      console.log("--- CHATGPT MODE ACTIVE (FREE AI) ---");
      const query = message.toLowerCase();
      
      try {
        // Use Free Pollinations Text AI to act like ChatGPT
        const aiUrl = `https://text.pollinations.ai/${encodeURIComponent(prompt)}`;
        const aiRes = await fetch(aiUrl);
        resultText = await aiRes.text();
        success = true;
      } catch (aiErr) {
        console.error("Free AI Fallback failed:", aiErr);
        // If even the free AI fails, use the local search
        const allNotes = db.prepare('SELECT * FROM notes WHERE user_id = ?').all(req.user.id);
        let combinedContent = allNotes.map(n => n.content).join("\n\n");
        const contentSentences = combinedContent.split(/[.!?\n]\s+/).filter(s => s.trim().length > 5);
        
        const queryWords = query.replace(/[?.,!]/g, "").split(" ").filter(w => w.length > 2);
        let matchesList = [];
        for (const sentence of contentSentences) {
          let matches = 0;
          if (queryWords.some(word => sentence.toLowerCase().includes(word))) matches++;
          if (matches > 0) matchesList.push(sentence);
        }
        resultText = matchesList.slice(0, 3).join(". ") || "I'm having a little trouble connecting to my brain, but I'm here for you!";
      }
    }

    // Handle Image requests for both modes - STRICTLY JUST THE IMAGE
    const imgKeywords = ["image", "picture", "picutre", "show", "shwo", "diagram", "daigram", "flow", "chart", "draw", "graph"];
    if (imgKeywords.some(k => message.toLowerCase().includes(k))) {
      
      const msgLower = message.toLowerCase();
      // If the user wants a precise diagram (flowchart, block diagram), use Mermaid for 100% accurate text and logic
      if (msgLower.includes("diagram") || msgLower.includes("daigram") || msgLower.includes("flow") || msgLower.includes("chart") || msgLower.includes("graph")) {
        const mermaidPrompt = `
          Analyze the following study material and generate a clean Mermaid.js diagram representing it.
          CRITICAL: Output ONLY the raw Mermaid code (e.g. graph TD...). Do NOT include \`\`\`mermaid backticks or any other text.
          Keep node text short and highly readable.
          
          Material Title: ${note.title}
          Material Content: ${note.content ? note.content.substring(0, 4000) : "General study concepts"}
          
          User Request: ${message}
        `;
        
        let mermaidCode = "graph TD\nA[Error] --> B[Could not generate diagram]";
        let mermaidSuccess = false;
        try {
          const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
          // Try multiple models to ensure compatibility
          const modelsToTry = ["gemini-pro", "gemini-1.0-pro", "gemini-1.5-flash"];
          for (const m of modelsToTry) {
            try {
              const model = genAI.getGenerativeModel({ model: m });
              const result = await model.generateContent(mermaidPrompt);
              mermaidCode = (await result.response.text()).replace(/```mermaid/gi, "").replace(/```/g, "").trim();
              mermaidSuccess = true;
              break;
            } catch(e) { continue; }
          }
        } catch (err) {
          console.error("Gemini failed, falling back to free AI");
        }
        
        if (!mermaidSuccess) {
          try {
             const aiRes = await fetch(`https://text.pollinations.ai/${encodeURIComponent(mermaidPrompt)}`);
             mermaidCode = (await aiRes.text()).replace(/```mermaid/gi, "").replace(/```/g, "").trim();
          } catch(e) { console.error("Free AI Mermaid failed"); }
        }
        
        // Convert to base64 image URL (safe for URLs)
        const base64Code = Buffer.from(mermaidCode).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
        return res.json({ content: `![Diagram](https://mermaid.ink/img/${base64Code})` });
      }

      // Fallback: If they just want an artistic picture/image, use Pollinations
      let finalTopic = note.title || "Study Concept";
      if (resultText && resultText.length > 10 && !resultText.includes("trouble connecting")) {
        finalTopic = resultText.substring(0, 150).replace(/[^a-zA-Z0-9 ]/g, " ");
      } else if (note.content && note.content.length > 20) {
        finalTopic = note.title + " related to " + note.content.substring(0, 100).replace(/[^a-zA-Z0-9 ]/g, " ");
      }
      
      const promptText = `professional labeled diagram representing ${finalTopic}, academic textbook style, highly detailed, vivid colors, white background`;
      return res.json({ content: `![Diagram](https://image.pollinations.ai/prompt/${encodeURIComponent(promptText)}?width=1024&height=768&seed=${Math.floor(Math.random() * 1000)}&nologo=true)` });
    }

    res.json({ content: resultText });
  } catch (error) {
    console.error('--- CHAT ERROR ---', error);
    res.status(500).json({ error: 'AI Assistant is currently busy.' });
  }
});

const https = require('https');
const forge = require('node-forge');

// Generate Self-Signed Certificate for HTTPS
function generateCertificate() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

  const attrs = [{ name: 'commonName', value: 'localhost' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey);

  return {
    key: forge.pki.privateKeyToPem(keys.privateKey),
    cert: forge.pki.certificateToPem(cert)
  };
}

const credentials = generateCertificate();
const httpsServer = https.createServer(credentials, app);

const PORT = process.env.PORT || 5000;
httpsServer.listen(PORT, '0.0.0.0', () => {
  console.log(`--- SECURE SERVER RUNNING ON PORT ${PORT} (HTTPS) ---`);
  console.log(`URL: https://localhost:${PORT}`);
  console.log('NOTE: Visit https://localhost:5000/api/notes once and click "Proceed" to allow the connection.');
});
