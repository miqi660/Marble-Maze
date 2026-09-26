package com.MarbleMaze.watch.ui.app

/** 仅用于手机设备预览；不写入 MazeDefinition，也不参与生成或同步。 */
data class DeviceRenderProfile(
    val width: Float, val height: Float, val radius: Float, val screenRadius: Float,
    val referenceScale: Float, val offsetX: Float, val offsetY: Float,
    val mazeLeft: Float, val mazeTop: Float, val mazeWidth: Float, val mazeHeight: Float,
    val titleY: Float, val metaY: Float, val footerY: Float
) {
    companion object {
        fun resolve(profile: String, variant: DeviceVariant?, cols: Int, rows: Int): DeviceRenderProfile {
            if (profile == "pro") return DeviceRenderProfile(336f, 480f, 42f, 40f, 1f, 0f, 0f,
                16f, 96f, 304f, 280f, 51f, 70f, 429f)
            val width = if (variant == DeviceVariant.BAND10) 212f else 192f
            val height = if (variant == DeviceVariant.BAND10) 520f else 490f
            val scale = minOf(width / 192f, height / 490f)
            val ox = (width - 192f * scale) / 2f
            val oy = (height - 490f * scale) / 2f
            val mazeWidth = 172f
            val mazeHeight = mazeWidth * rows / cols
            return DeviceRenderProfile(width, height, width / 2f, width / 2f - 2f, scale, ox, oy,
                ox + 10f * scale, oy + (490f - mazeHeight) / 2f * scale, mazeWidth * scale, mazeHeight * scale,
                oy + 49f * scale, oy + 66f * scale, oy + 440f * scale)
        }
    }
}

fun devicePreviewLabel(profile: String, variant: DeviceVariant?): String = when {
    profile == "pro" -> if (variant == DeviceVariant.BAND9PRO) "BAND 9 PRO" else "PRO"
    variant == DeviceVariant.BAND10 -> "BAND 10"
    variant == DeviceVariant.BAND9 -> "BAND 9"
    else -> "BAND"
}
