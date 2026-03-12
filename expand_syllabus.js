const fs = require('fs');

const content = fs.readFileSync('src/constants/syllabus.ts', 'utf-8');
const lines = content.split('\n');

const parsedLines = [];
const parentNames = new Set();
const allNames = new Set();

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Quick check if it looks like a tuple
    if (line.trim().startsWith('[') && line.includes(']')) {
        const start = line.indexOf('[');
        const end = line.lastIndexOf(']');
        
        let arr = null;
        try {
            const arrayStr = line.substring(start, end + 1);
            arr = eval(arrayStr);
        } catch (e) {
            // Ignore if eval fails
        }
        
        if (arr && Array.isArray(arr) && arr.length >= 4 && typeof arr[0] === 'number') {
            parsedLines.push({
                type: 'topic',
                line,
                indent: line.substring(0, start),
                arr,
                trailing: line.substring(end + 1)
            });
            
            if (arr.length >= 5 && arr[4]) {
                parentNames.add(arr[4]);
            }
            allNames.add(arr[1]);
            continue;
        }
    }
    
    parsedLines.push({
        type: 'text',
        line
    });
}

function splitTopicName(name) {
    if (name.includes(' — ')) {
        const parts = name.split(' — ');
        const base = parts[0];
        const rest = parts.slice(1).join(' — ');
        if (rest.includes(' & ')) {
            const sub = rest.split(' & ');
            return [`${base} — ${sub[0].trim()}`, `${base} — ${sub.slice(1).join(' & ').trim()}`];
        }
        if (rest.includes(', ')) {
            const sub = rest.split(', ');
            return [`${base} — ${sub[0].trim()}`, `${base} — ${sub.slice(1).join(', ').trim()}`];
        }
        return [`${base} — Basics`, `${base} — Details`];
    }
    if (name.includes(' & ')) {
        const parts = name.split(' & ');
        return [parts[0].trim(), parts.slice(1).join(' & ').trim()];
    }
    if (name.includes(' and ')) {
        const parts = name.split(' and ');
        return [parts[0].trim(), parts.slice(1).join(' and ').trim()];
    }
    if (name.includes(', ')) {
        const parts = name.split(', ');
        return [parts[0].trim(), parts.slice(1).join(', ').trim()];
    }
    return [`${name} - Fundamentals`, `${name} - Advanced`];
}

const newLines = [];
let addedTopicsCount = 0;

for (const parsed of parsedLines) {
    newLines.push(parsed.line);
    
    if (parsed.type === 'topic') {
        const arr = parsed.arr;
        const name = arr[1];
        const minutes = arr[3];
        
        // If it's a leaf node
        if (!parentNames.has(name)) {
            const [name1, name2] = splitTopicName(name);
            
            const min1 = Math.max(1, Math.floor(minutes / 2));
            const min2 = Math.max(1, Math.ceil(minutes / 2));
            
            const subIndent = parsed.indent + '  ';
            
            const line1 = `${subIndent}[${arr[0]}, '${name1.replace(/'/g, "\\'")}', ${arr[2]}, ${min1}, '${name.replace(/'/g, "\\'")}'],`;
            const line2 = `${subIndent}[${arr[0]}, '${name2.replace(/'/g, "\\'")}', ${arr[2]}, ${min2}, '${name.replace(/'/g, "\\'")}'],`;
            
            newLines.push(line1);
            newLines.push(line2);
            addedTopicsCount += 2;
        }
    }
}

fs.writeFileSync('src/constants/syllabus.ts', newLines.join('\n'));
console.log(`Successfully expanded. Added ${addedTopicsCount} new sub-topics.`);