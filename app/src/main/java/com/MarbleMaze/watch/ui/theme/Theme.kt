package com.MarbleMaze.watch.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

object BrutalColors {
    val Background = Color(0xFFF4F1E8)
    val Paper = Color(0xFFFFFDF5)
    val Ink = Color(0xFF151515)
    val Yellow = Color(0xFFFFD84D)
    val Green = Color(0xFF7FE39A)
    val Red = Color(0xFFFF7B70)
    val Muted = Color(0xFFDDDAD2)
}

private val AppColors = lightColorScheme(
    primary = BrutalColors.Ink, onPrimary = BrutalColors.Yellow,
    primaryContainer = BrutalColors.Yellow, onPrimaryContainer = BrutalColors.Ink,
    secondary = BrutalColors.Ink, onSecondary = BrutalColors.Paper,
    secondaryContainer = BrutalColors.Yellow, onSecondaryContainer = BrutalColors.Ink,
    background = BrutalColors.Background, onBackground = BrutalColors.Ink,
    surface = BrutalColors.Paper, onSurface = BrutalColors.Ink,
    surfaceContainer = BrutalColors.Paper, surfaceContainerLow = BrutalColors.Paper,
    surfaceContainerHigh = BrutalColors.Paper, surfaceContainerHighest = BrutalColors.Paper,
    surfaceTint = Color.Transparent, onSurfaceVariant = Color(0xFF53514A),
    outline = BrutalColors.Ink, outlineVariant = BrutalColors.Ink,
    tertiary = Color(0xFF245333), tertiaryContainer = BrutalColors.Green,
    onTertiaryContainer = BrutalColors.Ink,
    error = Color(0xFF8C2019), errorContainer = BrutalColors.Red, onErrorContainer = BrutalColors.Ink
)

@Composable
fun MarbleMazeTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = AppColors, typography = Typography,
        shapes = Shapes(extraSmall = RoundedCornerShape(6.dp), small = RoundedCornerShape(8.dp),
            medium = RoundedCornerShape(10.dp), large = RoundedCornerShape(12.dp), extraLarge = RoundedCornerShape(16.dp)),
        content = content)
}
