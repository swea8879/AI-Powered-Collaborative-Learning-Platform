const { createWorker } = require('tesseract.js');
const pdfImgConvert = require('pdf-img-convert');
const fs = require('fs');

const extractTextFromImage = async (imagePath) => {
    const worker = await createWorker();
    const { data: { text } } = await worker.recognize(imagePath);
    await worker.terminate();
    return text;
};

const extractTextFromScannedPdf = async (pdfPath) => {
    try {
        const pdfImages = await pdfImgConvert.convert(pdfPath, { width: 800 });
        let fullText = '';
        const worker = await createWorker();
        
        // Process first 5 pages to keep it fast, or all if it's small
        const pagesToProcess = Math.min(pdfImages.length, 10);
        
        for (let i = 0; i < pagesToProcess; i++) {
            const { data: { text } } = await worker.recognize(pdfImages[i]);
            fullText += text + '\n';
        }
        
        await worker.terminate();
        return fullText;
    } catch (err) {
        console.error("OCR Error:", err);
        return "";
    }
};

module.exports = {
    extractTextFromImage,
    extractTextFromScannedPdf
};
