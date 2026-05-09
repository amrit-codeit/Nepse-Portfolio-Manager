"""One-shot script to migrate /api/ prefixes to /api/v1/ in all router files."""
import glob

for path in glob.glob("app/api/*.py"):
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    old = 'prefix="/api/'
    new = 'prefix="/api/v1/'
    new_content = content.replace(old, new)
    if new_content != content:
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"Updated: {path}")
    else:
        print(f"Skipped: {path}")
