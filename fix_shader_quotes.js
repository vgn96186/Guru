const fs = require('fs');

let content = fs.readFileSync('modules/omni-canvas/android/src/main/java/expo/modules/omnicanvas/LoadingOrbView.kt', 'utf-8');

// The multi-line string block starts with `"""` and should end with `"""`.
// Sometimes the last `"""` might have hidden characters or formatting issues.
// Let's completely rewrite the shader constant declarations to be 100% sure they are correct Kotlin multi-line strings.

content = content.replace(/@Language\("AGSL"\)\nprivate const val TURBULENT_BLOB_SHADER = """[\s\S]*?\}?\n"""/m, (match) => {
    return match.replace(/\n"""$/, '\n"""');
});

content = content.replace(/@Language\("AGSL"\)\nprivate const val GLOW_SHADER = """[\s\S]*?\}?\n"""/m, (match) => {
    return match.replace(/\n"""$/, '\n"""');
});

content = content.replace(/@Language\("AGSL"\)\nprivate const val SPECULAR_SHADER = """[\s\S]*?\}?\n"""/m, (match) => {
    return match.replace(/\n"""$/, '\n"""');
});

fs.writeFileSync('modules/omni-canvas/android/src/main/java/expo/modules/omnicanvas/LoadingOrbView.kt', content);
