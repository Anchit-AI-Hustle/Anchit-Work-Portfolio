with open('nexus/index.html', 'r') as f:
    html = f.read()

old_nudge = """  function triggerGlobalChatNudge() {
    if (document.getElementById('cli')) { // Nexus
      document.getElementById('cli').focus();
    } else"""

new_nudge = """  function triggerGlobalChatNudge() {
    // In Nexus, if cli is not in DOM, open the chat node first
    if (!document.getElementById('cli') && typeof triggerNode === 'function') {
      triggerNode('n7');
    }
    if (document.getElementById('cli')) { // Nexus
      document.getElementById('cli').focus();
    } else"""

if old_nudge in html:
    html = html.replace(old_nudge, new_nudge)
    with open('nexus/index.html', 'w') as f:
        f.write(html)
    print("Fixed nudge in Nexus")
else:
    print("Could not find old_nudge")
