package com.MarbleMaze.watch

import com.MarbleMaze.watch.ui.app.DeviceRenderProfile
import com.MarbleMaze.watch.ui.app.DeviceVariant
import com.MarbleMaze.watch.ui.app.devicePreviewLabel
import org.junit.Assert.*
import org.junit.Test

class DeviceRenderProfileTest {
    @Test fun band10UsesOneScaleForBothAxesAndCentersTheReference() {
        val band9 = DeviceRenderProfile.resolve("band", DeviceVariant.BAND9, 8, 15)
        val band10 = DeviceRenderProfile.resolve("band", DeviceVariant.BAND10, 8, 15)
        val scale = minOf(212f / 192f, 520f / 490f)
        assertEquals(192f, band9.width, 0f)
        assertEquals(490f, band9.height, 0f)
        assertEquals(1f, band9.referenceScale, 0f)
        assertEquals(212f, band10.width, 0f)
        assertEquals(520f, band10.height, 0f)
        assertEquals(scale, band10.referenceScale, 0.0001f)
        assertEquals((212f - 192f * scale) / 2f, band10.offsetX, 0.0001f)
        assertEquals((520f - 490f * scale) / 2f, band10.offsetY, 0.0001f)
        assertEquals(band9.mazeLeft * scale + band10.offsetX, band10.mazeLeft, 0.0001f)
        assertEquals(band9.mazeTop * scale + band10.offsetY, band10.mazeTop, 0.0001f)
        assertEquals(band9.mazeWidth * scale, band10.mazeWidth, 0.0001f)
        assertEquals(band9.mazeHeight * scale, band10.mazeHeight, 0.0001f)
    }
    @Test fun everyBandPresetKeepsSquareCellsAndFitsInsideItsDevice() {
        for ((cols, rows) in listOf(7 to 13, 8 to 15, 9 to 17, 10 to 19, 11 to 20)) {
            for (variant in listOf(DeviceVariant.BAND9, DeviceVariant.BAND10)) {
                val target = DeviceRenderProfile.resolve("band", variant, cols, rows)
                assertEquals(target.mazeWidth / cols, target.mazeHeight / rows, 0.0001f)
                assertTrue(target.mazeTop > target.metaY)
                assertTrue(target.mazeTop + target.mazeHeight < target.footerY)
                assertTrue(target.mazeLeft > 0f)
                assertTrue(target.mazeLeft + target.mazeWidth < target.width)
            }
        }
    }
    @Test fun proKeepsExactCanvasAndCenteredNarrowerMaze() {
        val pro = DeviceRenderProfile.resolve("pro", DeviceVariant.BAND9PRO, 12, 10)
        assertEquals(336f, pro.width, 0f)
        assertEquals(480f, pro.height, 0f)
        assertEquals(42f, pro.radius, 0f)
        assertEquals(40f, pro.screenRadius, 0f)
        assertEquals(304f, pro.mazeWidth, 0f)
        assertEquals(280f, pro.mazeHeight, 0f)
        assertEquals(16f, pro.mazeLeft, 0f)
        assertEquals(96f, pro.mazeTop, 0f)
        assertEquals(pro.width, pro.mazeLeft * 2f + pro.mazeWidth, 0f)
    }
    @Test fun previewLabelsNeverMisrepresentTheSelectedProfile() {
        assertEquals("BAND 10", devicePreviewLabel("band", DeviceVariant.BAND10))
        assertEquals("BAND", devicePreviewLabel("band", DeviceVariant.BAND9PRO))
        assertEquals("PRO", devicePreviewLabel("pro", DeviceVariant.BAND10))
        assertEquals("BAND 9 PRO", devicePreviewLabel("pro", DeviceVariant.BAND9PRO))
    }
}
