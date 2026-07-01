const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// ვრთავთ სტატიკურ ფაილებს public საქაღალდიდან
app.use(express.static(path.join(__dirname, 'public')));

// URL-ების სწორად გადაბმის დამხმარე ფუნქცია
function resolveUrl(base, relative) {
    return new URL(relative, base).href;
}

// ჩამოტვირთვის მთავარი ენდპოინტი
app.get('/api/download', async (req, res) => {
    const videoUrl = req.query.url;
    const videoTitle = req.query.title || 'moon_video';

    if (!videoUrl) {
        return res.status(400).send('ვიდეოს ბმული სავალდებულოა (?url=...)');
    }

    try {
        const safeTitle = videoTitle.replace(/[\\/:*?"<>|]+/g, "_");
        
        // ბრაუზერს ვეუბნებით, რომ ფაილი უნდა გადმოიწეროს და არა უბრალოდ გაიხსნას
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeTitle)}.ts"`);
        res.setHeader('Content-Type', 'video/mp2t');

        // 1. ვკითხულობთ მთავარ მანიფესტს საიტიდან
        const response = await axios.get(videoUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        let manifestText = response.data;
        let currentManifestUrl = videoUrl;

        // 2. თუ ეს არის Master Playlist, ავტომატურად ვპოულობთ საუკეთესო ხარისხს (BANDWIDTH)
        if (manifestText.includes('#EXT-X-STREAM-INF')) {
            const lines = manifestText.split('\n').map(l => l.trim());
            let bestVariantUrl = null;
            let maxBandwidth = 0;

            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
                    const bwMatch = lines[i].match(/BANDWIDTH=(\d+)/);
                    const bw = bwMatch ? parseInt(bwMatch[1], 10) : 0;
                    const nextLine = lines[i + 1];
                    if (nextLine && !nextLine.startsWith('#') && bw > maxBandwidth) {
                        maxBandwidth = bw;
                        bestVariantUrl = nextLine;
                    }
                }
            }

            if (bestVariantUrl) {
                currentManifestUrl = resolveUrl(currentManifestUrl, bestVariantUrl);
                const variantRes = await axios.get(currentManifestUrl);
                manifestText = variantRes.data;
            }
        }

        // 3. ამოვიღოთ ყველა ვიდეო სეგმენტის (.ts) პირდაპირი ლინკი
        const lines = manifestText.split('\n').map(l => l.trim());
        const segments = [];
        for (const line of lines) {
            if (line && !line.startsWith('#')) {
                segments.push(resolveUrl(currentManifestUrl, line));
            }
        }

        if (segments.length === 0) {
            return res.status(404).send('ვიდეო სეგმენტები ვერ მოიძებნა მანიფესტში.');
        }

        // 4. სათითაოდ ამოვიღოთ სეგმენტები და რეალურ დროში ჩავწეროთ პასუხში (Streaming)
        for (let i = 0; i < segments.length; i++) {
            try {
                const segRes = await axios.get(segments[i], { responseType: 'arraybuffer' });
                res.write(Buffer.from(segRes.data));
            } catch (segErr) {
                console.error(`შეცდომა სეგმენტზე ${i}:`, segErr.message);
                // თუ ერთი სეგმენტი ჩავარდა, მაინც ვაგრძელებთ, რომ ფაილი არ გაფუჭდეს
            }
        }

        res.end();
    } catch (err) {
        console.error("სერვერის შეცდომა:", err.message);
        if (!res.headersSent) {
            res.status(500).send('ვიდეოს დამუშავება ჩავარდა: ' + err.message);
        }
    }
});

app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
