import os

filepath = 'public/.htaccess'
with open(filepath, 'rb') as f:
    raw_content = f.read()

# Decode from utf-16 and encode to utf-8
try:
    content = raw_content.decode('utf-16')
except UnicodeDecodeError:
    # maybe it's already utf-8 or ascii
    content = raw_content.decode('utf-8', errors='ignore')

# Write back as plain utf-8
with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content.strip())

print("Converted .htaccess to UTF-8")
