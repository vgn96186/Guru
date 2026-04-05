import os
import re

directories = ['src/screens', 'src/components', 'src/navigation']
ignore_suffixes = ['.unit.test.tsx', '.test.tsx']

color_map = {
    r"(?i)'#(?:1A1A24|1A1A2E|1E1E1E)'": "n.colors.surface",
    r"(?i)'#(?:2A2A38|2A2A4A|333344|333|2E6A2E|5C1E1E)'": "n.colors.border",
    r"(?i)'#(?:0F0F14|000000|000)'": "n.colors.background",
    r"(?i)'#(?:FFFFFF|FFF)'": "n.colors.textPrimary",
    r"(?i)'#(?:9E9E9E|A9B2C6|888|CCC|ddd|999|555)'": "n.colors.textMuted",
    r"(?i)'#(?:F44336|FF5252|D9534F|EF5350)'": "n.colors.error",
    r"(?i)'#(?:4CAF50)'": "n.colors.success",
    r"(?i)'#(?:FF9800|F3DF84|FFD700)'": "n.colors.warning",
    r"(?i)'#(?:6C63FF|A09CF7)'": "n.colors.accent",
    r"(?i)'#(?:2A1A1D|2A0A0A|332222)'": "n.colors.errorSurface",
    r"(?i)'#(?:1E3A1E|0D1F0D)'": "n.colors.successSurface",
}

def get_import_path(filepath):
    # Determine depth relative to src/
    parts = filepath.split('/')
    src_index = parts.index('src')
    depth = len(parts) - src_index - 2
    if depth == 0:
        return "'./theme/linearTheme'"
    return "'" + "../" * depth + "theme/linearTheme'"

def process_file(filepath):
    for suffix in ignore_suffixes:
        if filepath.endswith(suffix):
            return

    with open(filepath, 'r') as f:
        content = f.read()

    new_content = content
    for pattern, replacement in color_map.items():
        # Replace color strings matching the regex pattern
        new_content = re.sub(pattern, replacement, new_content)

    if new_content != content:
        # Check if linearTheme is already imported
        if 'import { linearTheme' not in new_content and 'from \'../theme/linearTheme' not in new_content and 'from "../../theme/linearTheme' not in new_content:
            import_path = get_import_path(filepath)
            import_statement = f"import {{ linearTheme as n }} from {import_path};\n"
            
            # Find the last import statement
            imports = re.findall(r'^import [^\n]+', new_content, re.MULTILINE)
            if imports:
                last_import = imports[-1]
                new_content = new_content.replace(last_import, last_import + '\n' + import_statement, 1)
            else:
                new_content = import_statement + "\n" + new_content

        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Updated {filepath}")

for d in directories:
    for root, dirs, files in os.walk(d):
        for file in files:
            if file.endswith('.tsx') or file.endswith('.ts'):
                process_file(os.path.join(root, file))

print("Color theme batch processing complete.")
