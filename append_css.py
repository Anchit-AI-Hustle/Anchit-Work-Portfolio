with open('scratch-css.css', 'r') as f:
    css1 = f.read()
with open('scratch-css-products.css', 'r') as f:
    css2 = f.read()

with open('index.html', 'r') as f:
    html = f.read()

# Replace closing </style> with the combined css + </style>
combined_css = css1 + '\n' + css2
html = html.replace('</style>', combined_css + '\n</style>', 1)

with open('index.html', 'w') as f:
    f.write(html)
