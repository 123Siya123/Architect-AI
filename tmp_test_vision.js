
async function test() {
    const apiKey = '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';

    console.log('Testing GitHub Models with a tiny 1x1 pixel image...');

    // Tiny 1x1 black pixel base64
    const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const dataUri = `data:image/png;base64,${base64Data}`;

    const body = {
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: 'You are a vision assistant.' },
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'What is in this image?' },
                    { type: 'image_url', image_url: { url: dataUri } }
                ]
            }
        ],
        max_tokens: 100
    };

    const startTime = Date.now();
    try {
        console.log('Fetching...');
        const response = await fetch('https://models.inference.ai.azure.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
        });

        console.log(`Status: ${response.status}`);
        const text = await response.text();
        console.log(`Response in ${Date.now() - startTime}ms:`, text);
    } catch (e) {
        console.error('Error:', e);
    }
}

test();
