package com.MarbleMaze.watch

import com.MarbleMaze.watch.ui.app.DeviceUiState
import com.MarbleMaze.watch.ui.app.MazeViewModel
import org.junit.Assert.*
import org.junit.Test

class NativeUiStateTest {
    @Test fun writesRequireConfirmedListAndIdleConnection() {
        val ready = DeviceUiState(connected = true, levels = emptyList())
        assertTrue(ready.canOperate)
        assertFalse(ready.copy(levels = null).canOperate)
        assertFalse(ready.copy(connected = false).canOperate)
        assertFalse(ready.copy(busy = true).canOperate)
        assertFalse(ready.copy(preparing = true).canOperate)
        assertFalse(ready.copy(unknown = true).canOperate)
    }
    @Test fun presetsKeepExistingGeneratorDimensions() {
        assertEquals(listOf(7 to 13, 8 to 15, 9 to 17, 10 to 19), MazeViewModel.presets.values.toList())
        assertEquals(listOf("简单", "正常", "困难", "专家"), MazeViewModel.presets.keys.map(MazeViewModel::label))
        assertEquals("自定义", MazeViewModel.label("custom"))
    }
    @Test fun proPresetsAndDeviceProfilesAreIndependent() {
        assertEquals(listOf(10 to 9, 12 to 10, 14 to 12, 16 to 13), MazeViewModel.profilePresets("pro").values.toList())
        assertEquals("band", com.MarbleMaze.watch.ui.app.DeviceVariant.identify("Xiaomi Smart Band 10")?.profile)
        assertEquals("pro", com.MarbleMaze.watch.ui.app.DeviceVariant.identify("Xiaomi Smart Band 9 Pro")?.profile)
        assertNull(com.MarbleMaze.watch.ui.app.DeviceVariant.identify("未知设备"))
    }
}
