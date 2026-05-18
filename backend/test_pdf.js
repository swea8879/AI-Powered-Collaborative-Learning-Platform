const fs = require('fs');
const path = require('path');

async function testPdf() {
    const filePath = process.argv[2];
    if (!filePath) {
        console.log("Please provide a PDF path");
        return;
    }

    const buffer = fs.readFileSync(filePath);

    console.log("--- Testing pdf-parse ---");
    try {
        const pdf = require('pdf-parse');
        const PDFParse = pdf.PDFParse;
        const data = await new PDFParse(buffer);
        console.log("pdf-parse success, keys:", Object.keys(data));
        if (data.text) console.log("Text length:", data.text.length);
        else console.log("NO TEXT PROPERTY");
    } catch (e) {
        console.log("pdf-parse failed:", e.message);
    }

    console.log("\n--- Testing officeparser ---");
    try {
        const officeParser = require('officeparser');
        officeParser.parseOffice(filePath, (data, err) => {
            if (err) console.log("officeparser direct failed:", err.message);
            else console.log("officeparser direct success, length:", data.length);
        });

        const absolutePath = path.resolve(filePath).replace(/\\/g, '/');
        const fileUrl = 'file://' + (absolutePath.startsWith('/') ? '' : '/') + absolutePath;
        console.log("Testing with fileUrl:", fileUrl);
        officeParser.parseOffice(fileUrl, (data, err) => {
            if (err) console.log("officeparser fileUrl failed:", err.message);
            else console.log("officeparser fileUrl success, length:", data.length);
        });
    } catch (e) {
        console.log("officeparser exception:", e.message);
    }
}

testPdf();
