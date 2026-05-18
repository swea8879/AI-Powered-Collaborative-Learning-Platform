require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Database = require('better-sqlite3');
const db = new Database('database.sqlite');

async function debugChat() {
  const noteId = 31; // Hill Cipher
  const message = "What is this note about?";
  
  try {
    const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId);
    if (!note) { console.log("Note not found"); return; }

    console.log("Using API Key:", process.env.GEMINI_API_KEY.substring(0, 5) + "...");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    const prompt = `
      You are an AI Study Assistant for the "NoteShare" platform.
      A user is asking a question about a specific note they have uploaded.
      
      Note Title: ${note.title}
      Note Content:
      ---
      ${note.content}
      ---
      
      User Question: ${message}
    `;

    console.log("Generating content...");
    const result = await model.generateContent(prompt);
    const response = await result.response;
    console.log("Response text:", response.text());
  } catch (error) {
    console.error("DEBUG ERROR:", error);
    if (error.response) {
      console.error("Response data:", await error.response.json());
    }
  }
}

debugChat();
