
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
  