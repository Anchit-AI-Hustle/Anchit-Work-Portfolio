with open('index.html', 'r') as f:
    html = f.read()

# Add a global error handler to visually display ANY errors on screen
error_handler = """
  <script>
    window.onerror = function(msg, url, line, col, error) {
      const errDiv = document.createElement('div');
      errDiv.style.cssText = "position:fixed;top:0;left:0;width:100%;background:red;color:white;z-index:9999999;padding:20px;font-size:16px;font-family:monospace;word-wrap:break-word;";
      errDiv.innerHTML = "<strong>FATAL ERROR:</strong> " + msg + "<br>Line: " + line + "<br>Stack: " + (error ? error.stack : 'N/A');
      document.body.appendChild(errDiv);
    };
    window.addEventListener('unhandledrejection', function(event) {
      const errDiv = document.createElement('div');
      errDiv.style.cssText = "position:fixed;top:0;left:0;width:100%;background:orange;color:black;z-index:9999999;padding:20px;font-size:16px;font-family:monospace;word-wrap:break-word;";
      errDiv.innerHTML = "<strong>PROMISE REJECTION:</strong> " + event.reason;
      document.body.appendChild(errDiv);
    });
  </script>
"""

# inject right after <body>
html = html.replace('<body>', '<body>\n' + error_handler)

with open('index.html', 'w') as f:
    f.write(html)
