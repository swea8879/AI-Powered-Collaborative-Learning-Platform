require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function check() {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // Note: The SDK doesn't have a direct listModels, but we can try to hit the endpoint manually or check the error
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent("test");
    console.log("SUCCESS with 1.5-flash");
  } catch (e) {
    console.error("ERROR:", e.message);
  }
}
check();
