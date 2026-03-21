import os
import re

count = 0
for root, _, files in os.walk('src'):
    for f in files:
        if not f.endswith(('.ts', '.tsx')): continue
        path = os.path.join(root, f)
        with open(path, 'r') as file:
            content = file.read()
            
        if '<<<<<<<' in content:
            # Replaces the whole conflict block with JUST the HEAD portion
            new_content = re.sub(r'<<<<<<< HEAD\n(.*?)=======\n.*?>>>>>>> [^\n]+\n', r'\1', content, flags=re.DOTALL)
            with open(path, 'w') as file:
                file.write(new_content)
            count += 1
print(f"Resolved {count} files.")
