const fs = require('fs');

let content = fs.readFileSync('modules/omni-canvas/android/src/main/java/expo/modules/omnicanvas/LoadingOrbView.kt', 'utf-8');

// Fix imports to add what is missing based on errors:
if (!content.includes('import androidx.compose.ui.graphics.drawscope.Stroke')) {
    content = content.replace('import androidx.compose.ui.graphics.drawscope.scale', 'import androidx.compose.ui.graphics.drawscope.scale\nimport androidx.compose.ui.graphics.drawscope.Stroke');
}

// Fix toPx issue - Float has dp, but dp.toPx() might need LocalDensity if not inside DrawScope, however size is just a Float. 
// If it's a Float representing dp, we can just use size directly if the Canvas modifier handles sizing.
// Alternatively, since inside `Box` but outside `Canvas`, `toPx` requires `LocalDensity.current`.
// But inside `Canvas` scope, `size` is available (as DrawScope size). 
// Wait, `val canvasSize = size.dp.toPx()` is inside `Box` which is a Composable, so it needs `LocalDensity.current.density`.
// Or better: pass `size * LocalDensity.current.density`

if (!content.includes('import androidx.compose.ui.platform.LocalDensity')) {
    content = content.replace('import androidx.compose.ui.platform.ComposeView', 'import androidx.compose.ui.platform.ComposeView\nimport androidx.compose.ui.platform.LocalDensity');
}

content = content.replace(/val canvasSize = size\.dp\.toPx\(\)/g, 'val canvasSize = size * LocalDensity.current.density');

// Fix Double * Float / Float * Double issues by casting `0.85f` etc properly.
// The errors say: "Argument type mismatch: actual type is 'ComplexDouble', but 'Float' was expected."
// Wait, what is ComplexDouble doing there? Oh, Kotlin is inferring `0.85f` but `size` might be something else?
// size is Float. Float * Float should be Float.
// Wait, `size` is Float. `canvasSize` is now `size * LocalDensity.current.density` which is Float.
// In the original it was `size.dp.toPx()`. Wait, `size.dp` is Dp. `toPx()` inside a Composable needs density.
// Oh, the error says `Cannot access 'fun Double.times(other: ComplexDouble): ComplexDouble': it is internal in file.`
// That means `canvasSize * 0.85f` is somehow resolving to some weird times extension?
// Let's explicitly cast `canvasSize` to Float, and change `0.85f` to `0.85f` to ensure it's `Float * Float`.

content = content.replace(/val canvasSize = size \* LocalDensity\.current\.density/g, 'val canvasSize = (size * LocalDensity.current.density).toFloat()');

// Replace any canvasSize * 0.85f with canvasSize.toFloat() * 0.85f if not already done, just to be safe.
// Wait, we can just do: `val canvasSize = (size * LocalDensity.current.density).toFloat()`
// Then canvasSize * 0.85f is guaranteed Float.

// Let's replace `halfSize * glowScale * 0.9f` to ensure it's float:
content = content.replace(/halfSize \* glowScale \* 0\.9f/g, '(halfSize * glowScale * 0.9f).toFloat()');

// Replace specular highlight offset: `(-size * 0.08f).dp` is fine because size is Float.
// Wait, let's fix all toPx():
content = content.replace(/size\.dp\.toPx\(\)/g, '(size * LocalDensity.current.density).toFloat()');

fs.writeFileSync('modules/omni-canvas/android/src/main/java/expo/modules/omnicanvas/LoadingOrbView.kt', content);
