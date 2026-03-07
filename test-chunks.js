const http = require('http');

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        }).on('error', reject);
    });
}

(async () => {
    try {
        console.log('Fetching /design...');
        const { status, data: html } = await fetchUrl('http://localhost:3000/design');
        console.log('HTML Status:', status);

        const scriptRegex = /<script[^>]+src="([^"]+)"/g;
        let match;
        const scripts = [];
        while ((match = scriptRegex.exec(html)) !== null) {
            let src = match[1];
            if (!src.startsWith('http')) src = 'http://localhost:3000' + (src.startsWith('/') ? src : '/' + src);
            scripts.push(src);
        }

        console.log(`Found ${scripts.length} scripts. Fetching them...`);
        for (const url of scripts) {
            console.log('Fetching', url);
            const res = await fetchUrl(url).catch(e => ({ status: 'ERROR', data: e.message }));
            console.log(`-> Status: ${res.status}, Length: ${res.data.length} bytes`);
        }
        console.log('Done.');
    } catch (e) {
        console.error('Failed:', e);
    }
})();
