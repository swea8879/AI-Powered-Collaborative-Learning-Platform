const msg = '![Diagram](https://image.pollinations.ai/prompt/professional%20labeled%20diagram%20representing%20Study%20Concept%2C%20academic%20textbook%20style%2C%20highly%20detailed%2C%20vivid%20colors%2C%20white%20background?width=1024&height=768&seed=374&nologo=true)';
const imgRegex = /!?\[.*?\]\s?\((https?:\/\/[^\s)]+)\)|(https?:\/\/(?:image\.)?pollinations\.ai[^\s)]+)|(https?:\/\/[^\s)]+\.(?:png|jpg|jpeg|gif|webp))/i;
const match = msg.match(imgRegex);
console.log('Match 0:', match[0]);
console.log('Match 1:', match[1]);
console.log('Cleaned:', msg.replace(match[0], '').trim());
