with open('index.html', 'r') as f:
    html = f.read()

# Replace the fragile localStorage logic with a robust try/catch wrapper
fragile_js = """    let userName = localStorage.getItem('anchit-user-name') || '';
    let chatHistory = JSON.parse(localStorage.getItem('anchit-chat-history') || '[]');"""

robust_js = """    let userName = '';
    let chatHistory = [];
    
    // Robust storage wrapper to handle file:// protocol restrictions or corrupted data
    const Storage = {
        get: (key) => {
            try { return localStorage.getItem(key); } catch(e) { return null; }
        },
        set: (key, val) => {
            try { localStorage.setItem(key, val); } catch(e) { }
        },
        remove: (key) => {
            try { localStorage.removeItem(key); } catch(e) { }
        }
    };

    userName = Storage.get('anchit-user-name') || '';
    try {
        const h = Storage.get('anchit-chat-history');
        if (h && h !== 'undefined') {
            chatHistory = JSON.parse(h);
        }
    } catch(e) {
        console.warn('History parse failed');
    }"""

html = html.replace(fragile_js, robust_js)

# Also update the save calls
html = html.replace("localStorage.setItem('anchit-chat-history', JSON.stringify(chatHistory));", "Storage.set('anchit-chat-history', JSON.stringify(chatHistory));")
html = html.replace("localStorage.setItem('anchit-user-name', userName);", "Storage.set('anchit-user-name', userName);")
html = html.replace("localStorage.removeItem('anchit-chat-history');", "Storage.remove('anchit-chat-history');")

with open('index.html', 'w') as f:
    f.write(html)
