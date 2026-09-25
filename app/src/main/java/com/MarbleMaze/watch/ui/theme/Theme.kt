package com.MarbleMaze.watch.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

private val AppColors = lightColorScheme(
    primary = Color(0xFF705B00), onPrimary = Color.White,
    primaryContainer = Color(0xFFFFE895), onPrimaryContainer = Color(0xFF28230E),
    secondaryContainer = Color(0xFFFFE895), onSecondaryContainer = Color(0xFF28230E),
    background = Color(0xFFF8F8F5), surface = Color(0xFFFCFCF9),
    surfaceContainerLow = Color.White, surfaceContainer = Color(0xFFF3F3EE),
    onSurface = Color(0xFF242521), onSurfaceVariant = Color(0xFF6B6D65),
    outlineVariant = Color(0xFFE2E3DC), tertiary = Color(0xFF39785C),
    error = Color(0xFFAD4C46), errorContainer = Color(0xFFFFE9E5)
)

@Composable
fun MarbleMazeTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = AppColors, typography = Typography,
        shapes = androidx.compose.material3.Shapes(
            small = androidx.compose.foundation.shape.RoundedCornerShape(14.dp),
            medium = androidx.compose.foundation.shape.RoundedCornerShape(20.dp),
            large = androidx.compose.foundation.shape.RoundedCornerShape(26.dp)), content = content)
}
