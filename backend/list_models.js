require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function list() {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // There isn't a direct listModels in the client SDK like this usually, 
    // but we can try a different model name.
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const result = await model.generateContent("Hello");
    console.log("Success with gemini-pro:", result.response.text());
  } catch (e) {
    console.error("Failed with gemini-pro:", e.message);
  }
}
list();
