require('dotenv').config();

async function testFetch() {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const payload = {
    contents: [{ parts: [{ text: "Hello" }] }]
  };

  try {
    console.log("Testing direct fetch to Gemini...");
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    if (response.ok) {
      console.log("SUCCESS! Response:", JSON.stringify(data, null, 2));
    } else {
      console.error("FAILED! Status:", response.status);
      console.error("Error data:", JSON.stringify(data, null, 2));
    }
  } catch (e) {
    console.error("FETCH ERROR:", e.message);
  }
}

testFetch();
