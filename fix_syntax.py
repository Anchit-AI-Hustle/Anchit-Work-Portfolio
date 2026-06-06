import re

with open('nexus/index.html', 'r') as f:
    html = f.read()

start_idx = html.find('const scripts = {')
end_idx = html.find('let current_node_idx = 0;')

scripts_block = html[start_idx:end_idx]
scripts_block_fixed = scripts_block.replace('</script>', '<\\/script>')

html = html[:start_idx] + scripts_block_fixed + html[end_idx:]

# Also fix the duplicate `};` we had earlier if it exists
html = html.replace('    let current_node_idx = 0;\n\n    };\n\n    function triggerNode', '    let current_node_idx = 0;\n\n    function triggerNode')

with open('nexus/index.html', 'w') as f:
    f.write(html)
